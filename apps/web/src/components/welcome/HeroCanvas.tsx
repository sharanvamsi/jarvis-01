"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/cn";

const CanvasRevealEffect: React.FC<{
  colors?: number[][];
  dotSize?: number;
  animationSpeed?: number;
  opacities?: number[];
  containerClassName?: string;
}> = ({
  colors = [[255, 255, 255]],
  dotSize = 4,
  animationSpeed = 3,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  containerClassName,
}) => {
  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors}
          dotSize={dotSize}
          animationSpeed={animationSpeed}
          opacities={opacities}
        />
      </div>
    </div>
  );
};

export default CanvasRevealEffect;

interface DotMatrixProps {
  colors?: number[][];
  dotSize?: number;
  animationSpeed?: number;
  opacities?: number[];
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[255, 255, 255]],
  dotSize = 4,
  animationSpeed = 3,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
}) => {
  const uniforms = useMemo(() => {
    const colorsArray = colors.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255]);
    const maxLen = 6;
    while (colorsArray.length < maxLen) {
      colorsArray.push(colorsArray[colorsArray.length - 1]);
    }

    return {
      u_colors: {
        value: colorsArray.map((c) => new THREE.Vector3(c[0], c[1], c[2])),
        type: "v3v",
      },
      u_opacities: {
        value: opacities,
        type: "1fv",
      },
      u_total_size: { value: 4, type: "1f" },
      u_dot_size: { value: dotSize, type: "1f" },
      u_time: { value: 0, type: "1f" },
      u_resolution: { value: new THREE.Vector2(), type: "v2" },
    };
  }, [colors, dotSize, opacities]);

  return (
    <Canvas
      style={{ position: "absolute", inset: 0, height: "100%", width: "100%" }}
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: "low-power",
      }}
    >
      <ShaderPlane source={fragmentShader} uniforms={uniforms} animationSpeed={animationSpeed} />
    </Canvas>
  );
};

type ShaderUniformValue =
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Vector3[]
  | number
  | number[];

type ShaderUniforms = {
  [key: string]: {
    value: ShaderUniformValue;
    type: string;
  };
};

const ShaderPlane: React.FC<{
  source: string;
  uniforms: ShaderUniforms;
  animationSpeed: number;
}> = ({ source, uniforms, animationSpeed }) => {
  const { size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const lastTime = useRef(0);

  useEffect(() => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    if (material.uniforms.u_resolution) {
      material.uniforms.u_resolution.value.set(size.width * 2, size.height * 2);
    }
  }, [size]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    const elapsed = clock.getElapsedTime();
    if (elapsed - lastTime.current < 1 / 60) return;
    lastTime.current = elapsed;
    material.uniforms.u_time.value = elapsed * animationSpeed;
  });

  const materialArgs = useMemo(() => {
    const preparedUniforms: { [key: string]: { value: ShaderUniformValue } } = {};
    for (const key in uniforms) {
      preparedUniforms[key] = { value: uniforms[key].value };
    }
    return {
      uniforms: preparedUniforms,
      vertexShader: vertexShader,
      fragmentShader: source,
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    };
  }, [uniforms, source]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial attach="material" args={[materialArgs]} />
    </mesh>
  );
};

const vertexShader = `
precision mediump float;
in vec2 uv;
out vec2 fragCoord;

void main() {
  fragCoord = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
precision mediump float;

in vec2 fragCoord;

uniform float u_time;
uniform float u_opacities[10];
uniform vec3 u_colors[6];
uniform float u_total_size;
uniform float u_dot_size;
uniform vec2 u_resolution;

out vec4 fragColor;

float PHI = 1.61803398874989484820459;

float random(vec2 xy) {
  return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
}

float map(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

float getOpacityIndex(float r) {
  return mod(r * 10.0, 10.0);
}

float getColorIndex(float r) {
  return mod(r * 6.0, 6.0);
}

void main() {
  vec2 st = fragCoord;
  st.x *= u_resolution.x / u_resolution.y;

  float opacity = step(0.0, st.x);
  opacity *= step(0.0, st.y);

  vec2 st2 = vec2(
    floor(st.x / (u_total_size / u_resolution.x)),
    floor(st.y / (u_total_size / u_resolution.y))
  );

  float frequency = 5.0;
  float show_offset = random(st2);
  float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency) + 1.0);
  opacity *= u_opacities[int(getOpacityIndex(rand))];

  opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / (u_total_size / u_resolution.x)));
  opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / (u_total_size / u_resolution.y)));

  // Reveal from center outward
  vec2 center = u_resolution / 2.0;
  vec2 pixel_pos = st * u_resolution;
  float dist = distance(pixel_pos, center);
  float max_dist = length(center);
  float reveal = u_time * 0.08;
  float dist_norm = dist / max_dist;
  opacity *= smoothstep(dist_norm - 0.1, dist_norm, reveal);

  vec3 color = u_colors[int(getColorIndex(rand))];

  fragColor = vec4(color, opacity);
}
`;
