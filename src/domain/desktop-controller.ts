import type { Facing } from "./actions";
import { collisionScene, createMotion, depenetrate, integrateMotion, wallContact, type DesktopScene, type MotionState } from "./motion";
export type DesktopAction = "idle-stand" | "stand-up" | "walk" | "run" | "lean" | "jump" | "fall" | "land";
export class DesktopController {
  motion: MotionState;
  scene: DesktopScene;
  action: DesktopAction = "idle-stand";
  facing: Facing = "front";
  age = 0;
  autonomous = true;
  private launched = false;
  private turnAfterLean = false;
  private nextChoice = 2.5;
  constructor(scene: DesktopScene, private random = Math.random) {
    this.scene = collisionScene(scene); this.motion = createMotion(this.scene);
  }
  setScene(scene: DesktopScene) { this.scene = collisionScene(scene); this.motion = depenetrate(this.motion, this.scene); }
  setAction(action: DesktopAction, facing: Facing = this.facing) {
    this.action = action; this.facing = facing; this.age = 0; this.launched = false;
  }
  request(action: DesktopAction, facing: Facing = "front") {
    if (!this.motion.grounded && action !== "fall") return false;
    if (action === "lean" && (facing === "front" || !wallContact(this.motion, this.scene, facing))) return false;
    if (this.action === "jump") return false;
    this.turnAfterLean = false; this.setAction(action, facing);
    if (action === "jump") this.motion.velocityX = 0;
    return true;
  }
  drop(x: number, y: number) {
    this.motion = depenetrate({ x, y, velocityX: 0, velocityY: 0, grounded: false }, this.scene);
    this.setAction(this.motion.grounded ? "land" : "fall");
  }
  reset() { this.motion = createMotion(this.scene); this.setAction("idle-stand", "front"); }
  tick(dt: number) {
    this.age += dt;
    if (this.action === "lean") {
      const contact = this.facing !== "front" && wallContact(this.motion, this.scene, this.facing);
      if (!this.motion.grounded || !contact) this.setAction(this.motion.grounded ? "idle-stand" : "fall");
      else if (this.age > 1.8 && this.turnAfterLean) {
        this.setAction("walk", this.facing === "right" ? "left" : "right"); this.turnAfterLean = false;
      }
    }
    let launch = false;
    if (this.action === "jump" && !this.launched && this.age >= 0.12) { launch = true; this.launched = true; }
    const speed = this.action === "walk" ? 95 : this.action === "run" ? 190 : 0;
    const result = integrateMotion(this.motion, this.scene, this.facing === "left" ? -speed : this.facing === "right" ? speed : 0, dt, launch);
    this.motion = result.state;
    if (result.landed) this.setAction("land");
    else if (!this.motion.grounded && this.motion.velocityY >= 0 && this.action !== "fall") this.setAction("fall");
    else if (result.contact && this.motion.grounded && (this.action === "walk" || this.action === "run")) {
      if (wallContact(this.motion, this.scene, result.contact.side)) { this.setAction("lean", result.contact.side); this.turnAfterLean = true; }
      else this.setAction("walk", this.facing === "right" ? "left" : "right");
    } else if (result.boundary && (this.action === "walk" || this.action === "run")) this.setAction(this.action, this.facing === "right" ? "left" : "right");
    if (this.action === "land" && this.age >= 0.22) this.setAction("idle-stand", "front");
    if (this.autonomous && this.motion.grounded && ["idle-stand", "walk", "run"].includes(this.action) && this.age > this.nextChoice) {
      this.nextChoice = 2.5 + this.random() * 3;
      const choice = this.random();
      if (choice < 0.15) this.request("jump");
      else if (choice < 0.35) this.setAction("idle-stand", "front");
      else this.setAction("walk", this.random() < 0.5 ? "left" : "right");
    }
  }
}
