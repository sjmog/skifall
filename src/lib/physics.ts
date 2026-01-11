import * as planck from 'planck';
import type { Line } from '../types';
import { smoothLineWithSpline } from './line-utils';
import { GRAVITY, CRASH_VELOCITY_THRESHOLD } from './constants';
import {
  HEAD_RADIUS,
  UPPER_BODY_WIDTH,
  UPPER_BODY_HEIGHT,
  LOWER_BODY_WIDTH,
  LOWER_BODY_HEIGHT,
  SKI_WIDTH,
  SKI_HEIGHT,
  type SkierRenderState,
} from './skier';
import type { StaticObstacle, WindZone } from './level-generator';

const { World, Vec2, Box, Circle, Edge, RevoluteJoint, WeldJoint } = planck;

const SCALE = 30;
const CATEGORY_GROUND = 0x0001;
const CATEGORY_SKIS = 0x0002;
const CATEGORY_BODY = 0x0004;
const CATEGORY_OBSTACLE = 0x0008;

function toPhysics(px: number): number {
  return px / SCALE;
}

function toPixels(m: number): number {
  return m * SCALE;
}

export interface PhysicsEngine {
  world: planck.World;
  head: planck.Body;
  upperBody: planck.Body;
  lowerBody: planck.Body;
  skis: planck.Body;
  neckJoint: planck.Joint | null;
  hipJoint: planck.Joint | null;
  ankleJoint: planck.Joint | null;
  groundBody: planck.Body;
  lineFixtures: Map<string, planck.Fixture[]>;
  obstacleBodies: Map<string, planck.Body>;
  windZones: WindZone[];
  crashed: boolean;
  spawnX: number;
  spawnY: number;
  skisGroundContacts: number;
}

export interface SkierPhysicsState {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  angularVelocity: number;
  isGrounded: boolean;
  crashed: boolean;
}

export function createPhysicsEngine(spawnX: number, spawnY: number): PhysicsEngine {
  const world = new World({ gravity: Vec2(0, GRAVITY * 10) });
  const groundBody = world.createBody({ type: 'static' });

  const headR = toPhysics(HEAD_RADIUS);
  const upperW = toPhysics(UPPER_BODY_WIDTH);
  const upperH = toPhysics(UPPER_BODY_HEIGHT);
  const lowerW = toPhysics(LOWER_BODY_WIDTH);
  const lowerH = toPhysics(LOWER_BODY_HEIGHT);
  const skiW = toPhysics(SKI_WIDTH);
  const skiH = toPhysics(SKI_HEIGHT);

  const pSpawnX = toPhysics(spawnX);
  const pSpawnY = toPhysics(spawnY);

  const skiCenterY = pSpawnY;
  const ankleY = skiCenterY - skiH / 2;
  const lowerCenterY = ankleY - lowerH / 2;
  const hipY = lowerCenterY - lowerH / 2;
  const upperCenterY = hipY - upperH / 2;
  const neckY = upperCenterY - upperH / 2;
  const headCenterY = neckY - headR;

  const head = world.createBody({
    type: 'dynamic',
    position: Vec2(pSpawnX, headCenterY),
    bullet: true,
    angularDamping: 2.0,
    linearDamping: 0.1,
  });
  head.createFixture({
    shape: new Circle(headR),
    density: 0.8,
    friction: 0.3,
    restitution: 0.2,
    filterCategoryBits: CATEGORY_BODY,
    filterMaskBits: CATEGORY_GROUND | CATEGORY_OBSTACLE,
  });
  head.setUserData({ type: 'body' });

  const upperBody = world.createBody({
    type: 'dynamic',
    position: Vec2(pSpawnX, upperCenterY),
    bullet: true,
    angularDamping: 3.0,
    linearDamping: 0.1,
  });
  upperBody.createFixture({
    shape: new Box(upperW / 2, upperH / 2),
    density: 1.0,
    friction: 0.3,
    restitution: 0.1,
    filterCategoryBits: CATEGORY_BODY,
    filterMaskBits: CATEGORY_GROUND | CATEGORY_OBSTACLE,
  });
  upperBody.setUserData({ type: 'body' });

  const lowerBody = world.createBody({
    type: 'dynamic',
    position: Vec2(pSpawnX, lowerCenterY),
    bullet: true,
    angularDamping: 2.0,
    linearDamping: 0.1,
  });
  lowerBody.createFixture({
    shape: new Box(lowerW / 2, lowerH / 2),
    density: 0.8,
    friction: 0.3,
    restitution: 0.1,
    filterCategoryBits: CATEGORY_BODY,
    filterMaskBits: CATEGORY_GROUND | CATEGORY_OBSTACLE,
  });
  lowerBody.setUserData({ type: 'body' });

  const skis = world.createBody({
    type: 'dynamic',
    position: Vec2(pSpawnX, skiCenterY),
    bullet: true,
    angularDamping: 1.0,
    linearDamping: 0.05,
  });
  skis.createFixture({
    shape: new Box(skiW / 2, skiH / 2),
    density: 0.3,
    friction: 0.02,
    restitution: 0.0,
    filterCategoryBits: CATEGORY_SKIS,
    filterMaskBits: CATEGORY_GROUND | CATEGORY_OBSTACLE,
  });
  skis.setUserData({ type: 'skis' });

  const neckJoint = world.createJoint(
    new WeldJoint({ frequencyHz: 8.0, dampingRatio: 0.9 }, head, upperBody, Vec2(pSpawnX, neckY))
  );

  const hipJoint = world.createJoint(
    new RevoluteJoint(
      { enableLimit: true, lowerAngle: -Math.PI / 6, upperAngle: Math.PI / 6 },
      upperBody,
      lowerBody,
      Vec2(pSpawnX, hipY)
    )
  );

  const ankleJoint = world.createJoint(new WeldJoint({}, lowerBody, skis, Vec2(pSpawnX, ankleY)));

  head.setActive(false);
  upperBody.setActive(false);
  lowerBody.setActive(false);
  skis.setActive(false);

  const engine: PhysicsEngine = {
    world,
    head,
    upperBody,
    lowerBody,
    skis,
    neckJoint,
    hipJoint,
    ankleJoint,
    groundBody,
    lineFixtures: new Map(),
    obstacleBodies: new Map(),
    windZones: [],
    crashed: false,
    spawnX,
    spawnY,
    skisGroundContacts: 0,
  };

  world.on('begin-contact', (contact) => {
    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();
    const userDataA = bodyA.getUserData() as { type: string } | null;
    const userDataB = bodyB.getUserData() as { type: string } | null;

    const skisHitGround = userDataA?.type === 'skis' && bodyB === groundBody;
    const groundHitSkis = userDataB?.type === 'skis' && bodyA === groundBody;
    if (skisHitGround || groundHitSkis) {
      engine.skisGroundContacts++;
    }

    const bodyHitGround = userDataA?.type === 'body' && bodyB === groundBody;
    const groundHitBody = userDataB?.type === 'body' && bodyA === groundBody;
    const bodyHitObstacle = (userDataA?.type === 'body' || userDataA?.type === 'skis') && userDataB?.type === 'obstacle';
    const obstacleHitBody = (userDataB?.type === 'body' || userDataB?.type === 'skis') && userDataA?.type === 'obstacle';

    if ((bodyHitGround || groundHitBody || bodyHitObstacle || obstacleHitBody) && !engine.crashed && engine.hipJoint) {
      const bodyPart = bodyHitGround || bodyHitObstacle ? bodyA : bodyB;
      
      const velocity = bodyPart.getLinearVelocity();
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
      
      if (speed > CRASH_VELOCITY_THRESHOLD) {
        engine.crashed = true;
      }
    }
  });

  world.on('end-contact', (contact) => {
    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();
    const userDataA = bodyA.getUserData() as { type: string } | null;
    const userDataB = bodyB.getUserData() as { type: string } | null;

    const skisLeftGround = userDataA?.type === 'skis' && bodyB === groundBody;
    const groundLeftSkis = userDataB?.type === 'skis' && bodyA === groundBody;
    if (skisLeftGround || groundLeftSkis) {
      engine.skisGroundContacts = Math.max(0, engine.skisGroundContacts - 1);
    }
  });

  return engine;
}

export function addLineToWorld(engine: PhysicsEngine, line: Line): void {
  if (line.points.length < 2) return;

  const smoothed = smoothLineWithSpline(line.points, 8);
  if (smoothed.length < 2) return;

  const fixtures: planck.Fixture[] = [];

  for (let i = 0; i < smoothed.length - 1; i++) {
    const p1 = smoothed[i];
    const p2 = smoothed[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (Math.sqrt(dx * dx + dy * dy) < 1) continue;

    const fixture = engine.groundBody.createFixture({
      shape: new Edge(Vec2(toPhysics(p1.x), toPhysics(p1.y)), Vec2(toPhysics(p2.x), toPhysics(p2.y))),
      friction: 0.1,
      restitution: 0.0,
      filterCategoryBits: CATEGORY_GROUND,
      filterMaskBits: CATEGORY_SKIS | CATEGORY_BODY,
    });

    fixtures.push(fixture);
  }

  engine.lineFixtures.set(line.id, fixtures);
}

export function removeLineFromWorld(engine: PhysicsEngine, lineId: string): void {
  const fixtures = engine.lineFixtures.get(lineId);
  if (fixtures) {
    for (const fixture of fixtures) {
      engine.groundBody.destroyFixture(fixture);
    }
    engine.lineFixtures.delete(lineId);
  }
}

export function resetSkier(engine: PhysicsEngine): void {
  const headR = toPhysics(HEAD_RADIUS);
  const upperH = toPhysics(UPPER_BODY_HEIGHT);
  const lowerH = toPhysics(LOWER_BODY_HEIGHT);
  const skiH = toPhysics(SKI_HEIGHT);

  const pSpawnX = toPhysics(engine.spawnX);
  const pSpawnY = toPhysics(engine.spawnY);

  const skiCenterY = pSpawnY;
  const ankleY = skiCenterY - skiH / 2;
  const lowerCenterY = ankleY - lowerH / 2;
  const hipY = lowerCenterY - lowerH / 2;
  const upperCenterY = hipY - upperH / 2;
  const neckY = upperCenterY - upperH / 2;
  const headCenterY = neckY - headR;

  const resetBody = (body: planck.Body, x: number, y: number) => {
    body.setPosition(Vec2(x, y));
    body.setLinearVelocity(Vec2(0, 0));
    body.setAngularVelocity(0);
    body.setAngle(0);
  };

  resetBody(engine.head, pSpawnX, headCenterY);
  resetBody(engine.upperBody, pSpawnX, upperCenterY);
  resetBody(engine.lowerBody, pSpawnX, lowerCenterY);
  resetBody(engine.skis, pSpawnX, skiCenterY);

  if (engine.crashed) {
    engine.neckJoint = engine.world.createJoint(
      new WeldJoint({ frequencyHz: 8.0, dampingRatio: 0.9 }, engine.head, engine.upperBody, Vec2(pSpawnX, neckY))
    );
    engine.hipJoint = engine.world.createJoint(
      new RevoluteJoint(
        { enableLimit: true, lowerAngle: -Math.PI / 6, upperAngle: Math.PI / 6 },
        engine.upperBody,
        engine.lowerBody,
        Vec2(pSpawnX, hipY)
      )
    );
    engine.ankleJoint = engine.world.createJoint(
      new WeldJoint({}, engine.lowerBody, engine.skis, Vec2(pSpawnX, ankleY))
    );
    engine.crashed = false;
  }

  engine.head.setActive(false);
  engine.upperBody.setActive(false);
  engine.lowerBody.setActive(false);
  engine.skis.setActive(false);
  engine.skisGroundContacts = 0;
}

export function startSkier(engine: PhysicsEngine): void {
  engine.head.setActive(true);
  engine.upperBody.setActive(true);
  engine.lowerBody.setActive(true);
  engine.skis.setActive(true);
}

function createObstacleFixture(body: planck.Body, rendered: { width: number; height: number }): void {
  const halfWidth = toPhysics(rendered.width / 2);
  const halfHeight = toPhysics(rendered.height / 2);
  body.createFixture({
    shape: new Box(halfWidth, halfHeight),
    filterCategoryBits: CATEGORY_OBSTACLE,
    filterMaskBits: CATEGORY_BODY | CATEGORY_SKIS,
  });
}

export function addObstaclesToWorld(engine: PhysicsEngine, obstacles: StaticObstacle[]): void {
  for (const [, body] of engine.obstacleBodies) {
    engine.world.destroyBody(body);
  }
  engine.obstacleBodies.clear();
  
  const RENDERED_SIZE = 200;
  const COLLISION_SIZE = RENDERED_SIZE * 0.6;
  
  for (const obstacle of obstacles) {
    const centerX = obstacle.position.x + RENDERED_SIZE / 2;
    const centerY = obstacle.position.y + RENDERED_SIZE / 2;
    
    const body = engine.world.createBody({
      type: 'static',
      position: Vec2(toPhysics(centerX), toPhysics(centerY)),
    });

    createObstacleFixture(body, { width: COLLISION_SIZE, height: COLLISION_SIZE });
    body.setUserData({ type: 'obstacle', obstacleId: obstacle.id });
    engine.obstacleBodies.set(obstacle.id, body);
  }
}

export function setWindZones(engine: PhysicsEngine, windZones: WindZone[]): void {
  engine.windZones = windZones;
}

function isPointInWindZone(point: { x: number; y: number }, zone: WindZone): boolean {
  const px = toPixels(point.x);
  const py = toPixels(point.y);
  return (
    px >= zone.position.x &&
    px <= zone.position.x + zone.bounds.width &&
    py >= zone.position.y &&
    py <= zone.position.y + zone.bounds.height
  );
}

export function stepPhysics(engine: PhysicsEngine, deltaMs: number): void {
  if (engine.crashed && engine.hipJoint) {
    if (engine.neckJoint) {
      engine.world.destroyJoint(engine.neckJoint);
      engine.neckJoint = null;
    }
    if (engine.hipJoint) {
      engine.world.destroyJoint(engine.hipJoint);
      engine.hipJoint = null;
    }
    if (engine.ankleJoint) {
      engine.world.destroyJoint(engine.ankleJoint);
      engine.ankleJoint = null;
    }

    engine.head.setAngularVelocity(engine.head.getAngularVelocity() + (Math.random() - 0.5) * 20);
    engine.upperBody.setAngularVelocity(engine.upperBody.getAngularVelocity() + (Math.random() - 0.5) * 15);
    engine.lowerBody.setAngularVelocity(engine.lowerBody.getAngularVelocity() + (Math.random() - 0.5) * 12);
    engine.skis.setAngularVelocity(engine.skis.getAngularVelocity() + (Math.random() - 0.5) * 20);
  }

  if (engine.windZones.length > 0 && !engine.crashed) {
    const skisPos = engine.skis.getPosition();
    for (const zone of engine.windZones) {
      if (isPointInWindZone(skisPos, zone)) {
        const windForce = zone.direction === 'right' ? zone.strength : -zone.strength;
        const forceX = windForce * GRAVITY * 10;
        engine.skis.applyForce(Vec2(forceX, 0), skisPos);
      }
    }
  }

  const dt = Math.min(deltaMs / 1000, 1 / 30);
  engine.world.step(dt, 8, 3);
}

export function getSkierState(engine: PhysicsEngine): SkierRenderState {
  const headPos = engine.head.getPosition();
  const upperPos = engine.upperBody.getPosition();
  const lowerPos = engine.lowerBody.getPosition();
  const skisPos = engine.skis.getPosition();

  return {
    head: { x: toPixels(headPos.x), y: toPixels(headPos.y), angle: engine.head.getAngle() },
    upper: { x: toPixels(upperPos.x), y: toPixels(upperPos.y), angle: engine.upperBody.getAngle() },
    lower: { x: toPixels(lowerPos.x), y: toPixels(lowerPos.y), angle: engine.lowerBody.getAngle() },
    skis: { x: toPixels(skisPos.x), y: toPixels(skisPos.y), angle: engine.skis.getAngle() },
    crashed: engine.crashed,
  };
}

export function getSkierPhysicsState(engine: PhysicsEngine): SkierPhysicsState {
  const skisPos = engine.skis.getPosition();
  const skisVel = engine.skis.getLinearVelocity();

  return {
    position: { x: toPixels(skisPos.x), y: toPixels(skisPos.y) },
    velocity: { x: toPixels(skisVel.x), y: toPixels(skisVel.y) },
    angle: engine.skis.getAngle(),
    angularVelocity: engine.skis.getAngularVelocity(),
    isGrounded: engine.skisGroundContacts > 0,
    crashed: engine.crashed,
  };
}
