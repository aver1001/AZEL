// Moving things: small animals, residents, firefighters, fire trucks and
// helicopters. Same vertex-colored low-poly kit as the static props.
import * as THREE from 'three';
import { part, merge, box, cyl, cone, ico, sphere } from './geo.js';

const SKIN = 0xe8bd98;

export function rabbitGeo() {
  return merge([
    part(sphere(0.16, 8, 6), 0xece6dc, [0, 0.16, 0], [0, 0, 0], [1, 0.85, 1.25]),
    part(sphere(0.1, 8, 6), 0xf2ede4, [0, 0.27, 0.16]),
    part(cyl(0.025, 0.035, 0.2, 5), 0xf2ede4, [-0.04, 0.42, 0.14], [0.2, 0, 0.15]),
    part(cyl(0.025, 0.035, 0.2, 5), 0xf2ede4, [0.04, 0.42, 0.14], [0.2, 0, -0.15]),
    part(sphere(0.05, 6, 4), 0xffffff, [0, 0.18, -0.2]),
    part(sphere(0.016, 4, 3), 0x1a1a1a, [-0.05, 0.3, 0.24]),
    part(sphere(0.016, 4, 3), 0x1a1a1a, [0.05, 0.3, 0.24]),
  ]);
}

export function squirrelGeo() {
  return merge([
    part(sphere(0.1, 8, 6), 0xb0643a, [0, 0.12, 0], [0, 0, 0], [0.9, 0.9, 1.2]),
    part(sphere(0.07, 8, 6), 0xbb6f42, [0, 0.2, 0.11]),
    part(sphere(0.1, 8, 6), 0xc87d4f, [0, 0.24, -0.16], [0.6, 0, 0], [0.7, 1.6, 0.7]),
    part(cone(0.02, 0.05, 4), 0xb0643a, [-0.035, 0.28, 0.1]),
    part(cone(0.02, 0.05, 4), 0xb0643a, [0.035, 0.28, 0.1]),
  ]);
}

export function personGeo(shirt = 0xffffff) {
  return merge([
    part(cyl(0.12, 0.14, 0.8, 7), 0x3b4254, [0, 0.4, 0]),
    part(cyl(0.22, 0.18, 0.65, 8), shirt, [0, 1.1, 0]),
    part(sphere(0.15, 8, 6), SKIN, [0, 1.58, 0]),
    part(sphere(0.155, 8, 4), 0x3a2a22, [0, 1.63, -0.02], [0, 0, 0], [1, 0.7, 1]),
    part(cyl(0.06, 0.06, 0.6, 5), shirt, [0.28, 1.12, 0], [0, 0, 0.25]),
    part(cyl(0.06, 0.06, 0.6, 5), shirt, [-0.28, 1.12, 0], [0, 0, -0.25]),
  ]);
}

export function firefighterGeo() {
  const coat = 0x2d2a28;
  const stripe = 0xd7e84a;
  return merge([
    part(cyl(0.14, 0.16, 0.8, 7), coat, [0, 0.4, 0]),
    part(cyl(0.25, 0.21, 0.7, 8), coat, [0, 1.12, 0]),
    part(cyl(0.255, 0.255, 0.08, 8), stripe, [0, 0.95, 0]),
    part(cyl(0.225, 0.225, 0.08, 8), stripe, [0, 1.32, 0]),
    part(sphere(0.15, 8, 6), SKIN, [0, 1.6, 0]),
    part(sphere(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xd1302a, [0, 1.66, 0], [0, 0, 0], [1, 0.75, 1.15]),
    part(cyl(0.24, 0.24, 0.03, 10), 0xd1302a, [0, 1.66, 0.02]),
    // extinguisher
    part(cyl(0.09, 0.09, 0.5, 8), 0xd1302a, [0.3, 0.95, 0.25]),
    part(cyl(0.03, 0.03, 0.3, 5), 0x222222, [0.3, 1.12, 0.48], [Math.PI / 2, 0, 0]),
  ]);
}

export function truckGeo() {
  const red = 0xc9261f;
  const parts = [
    part(box(2.5, 1.6, 7.6), red, [0, 1.5, -0.4]),
    part(box(2.5, 1.5, 2.2), red, [0, 1.75, 3.7]),
    part(box(2.52, 0.7, 1.4), 0x2a3440, [0, 2.1, 4.2]),
    part(box(2.54, 0.22, 11), 0xf2f2f2, [0, 1.2, 0.9]),
    part(box(0.6, 0.35, 5.8), 0xb9bec6, [0, 2.55, -0.6]),
    part(box(0.12, 0.2, 5.8), 0xb9bec6, [0.35, 2.8, -0.6]),
    part(box(0.12, 0.2, 5.8), 0xb9bec6, [-0.35, 2.8, -0.6]),
    // roof water cannon
    part(cyl(0.3, 0.35, 0.4, 8), 0x9aa0a8, [0, 2.6, 2.4]),
    part(cyl(0.12, 0.12, 1.4, 6), 0x9aa0a8, [0, 2.9, 3.0], [Math.PI / 2 - 0.3, 0, 0]),
    // lightbar
    part(box(1.6, 0.18, 0.3), 0x3a78ff, [0, 2.6, 4.4]),
    part(box(0.5, 0.2, 0.32), 0xff3a3a, [0.55, 2.61, 4.4]),
    part(box(0.5, 0.2, 0.32), 0xff3a3a, [-0.55, 2.61, 4.4]),
  ];
  for (const z of [3.4, 0.2, -2.8]) {
    parts.push(part(cyl(0.55, 0.55, 0.4, 10), 0x1f1f22, [1.2, 0.55, z], [0, 0, Math.PI / 2]));
    parts.push(part(cyl(0.55, 0.55, 0.4, 10), 0x1f1f22, [-1.2, 0.55, z], [0, 0, Math.PI / 2]));
  }
  return merge(parts);
}

/** Glowing rear engine hatch: the weak spot (drawn separately so it can pulse). */
export function truckEngineGeo() {
  return merge([part(box(2.0, 1.1, 0.12), 0xffffff, [0, 1.35, -4.25])]);
}

export function heliGeo() {
  const red = 0xd23a2c;
  return merge([
    part(sphere(1.4, 12, 8), red, [0, 0, 0.6], [0, 0, 0], [1, 0.95, 1.7]),
    part(sphere(1.0, 10, 6), 0x2a3440, [0, 0.25, 2.2], [0, 0, 0], [1, 0.8, 0.8]),
    part(cyl(0.3, 0.45, 5, 8), red, [0, 0.3, -3.2], [Math.PI / 2, 0, 0]),
    part(box(0.12, 1.4, 1.0), 0xf2f2f2, [0, 0.9, -5.5]),
    part(box(2, 0.1, 0.5), 0xf2f2f2, [0, 0.3, -5.4]),
    part(box(0.12, 0.12, 3.4), 0x333333, [0.9, -1.4, 0.6]),
    part(box(0.12, 0.12, 3.4), 0x333333, [-0.9, -1.4, 0.6]),
    part(box(0.1, 0.6, 0.1), 0x333333, [0.9, -1.1, 1.4]),
    part(box(0.1, 0.6, 0.1), 0x333333, [-0.9, -1.1, 1.4]),
    part(cyl(0.2, 0.2, 0.6, 6), 0x444444, [0, 1.5, 0.6]),
    part(box(3.2, 0.12, 0.2), 0xf2f2f2, [0, 0.1, 0.6]),
  ]);
}

export function rotorGeo() {
  return merge([
    part(box(12, 0.08, 0.45), 0x2a2a2a, [0, 0, 0]),
    part(box(0.45, 0.08, 12), 0x2a2a2a, [0, 0, 0]),
  ]);
}

export function bucketGeo() {
  return merge([
    part(cyl(0.9, 0.6, 1.2, 10), 0xe07a24, [0, 0, 0]),
    part(cyl(0.02, 0.02, 6, 3), 0x222222, [0, 3.4, 0]),
  ]);
}
