import { protect } from './seller.js';
import { GhostAgent, type AgentOptions } from './agent.js';

export * from './http.js';
export * from './agent.js';
export * from './seller.js';

/** The ergonomic entry point: `ghosttab.protect({ price: 0.01 })` and `ghosttab.agent({ mint })`. */
export const ghosttab = {
  protect,
  agent: (opts: AgentOptions) => new GhostAgent(opts),
};
