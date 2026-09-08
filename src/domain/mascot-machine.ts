import { ACTIONS, type ActionId, type Facing } from "./actions";

export interface MascotState { action: ActionId; facing: Facing; since: number; }

export class MascotMachine {
  state: MascotState = { action: "idle-stand", facing: "front", since: performance.now() };

  transition(action: ActionId, facing: Facing = this.state.facing): MascotState {
    if (!ACTIONS[action].facing.includes(facing)) facing = ACTIONS[action].facing[0];
    this.state = { action, facing, since: performance.now() };
    return this.state;
  }

  tick(now: number): MascotState | undefined {
    const spec = ACTIONS[this.state.action];
    if (!spec.loop && now - this.state.since >= spec.durationMs[1]) return this.transition(spec.next);
  }
}
