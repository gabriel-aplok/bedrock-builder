import { renderJson } from "./serialize.js";

export interface ParticleTemplateOptions {
  identifier: string;
  texture: string;
}

export function renderParticleJson(opts: ParticleTemplateOptions): string {
  return renderJson({
    format_version: "1.10.0",
    particle_effect: {
      description: {
        identifier: opts.identifier,
        basic_render_parameters: {
          material: "particles_alpha",
          texture: opts.texture,
        },
      },
      components: {
        "minecraft:emitter_rate_instant": { num_particles: 1 },
        "minecraft:emitter_lifetime_once": {},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": { max_lifetime: 1 },
        "minecraft:particle_appearance_billboard": {
          size: [0.1, 0.1],
          facing_camera_mode: "rotate_xyz",
          uv: {
            texture_width: 128,
            texture_height: 128,
            uv: [0, 0],
            uv_size: [8, 8],
          },
        },
      },
    },
  });
}
