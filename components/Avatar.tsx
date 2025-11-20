import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';

interface AvatarProps {
  url: string;
  analyser: AnalyserNode | null;
  expressionFactor: number;
}

export const Avatar: React.FC<AvatarProps> = ({ url, analyser, expressionFactor }) => {
  const { scene, camera } = useThree();
  const [vrm, setVrm] = useState<any>(null);
  const currentExpressionRef = useRef<string>('neutral');
  const blinkTimerRef = useRef<number>(0);
  const expressionTimerRef = useRef<number>(0);
  const noiseOffsetRef = useRef<number>(Math.random() * 100);

  // Load VRM
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });
  });

  useEffect(() => {
    if (gltf.userData.vrm) {
      const vrmInstance = gltf.userData.vrm;
      
      // Fix materials for standard environment
      VRMUtils.rotateVRM0(vrmInstance);
      vrmInstance.scene.rotation.y = Math.PI; // Face forward
      
      // --- FIX T-POSE ---
      // Rotate arms down to a relaxed "A-pose"
      const leftUpperArm = vrmInstance.humanoid.getNormalizedBoneNode('leftUpperArm');
      const rightUpperArm = vrmInstance.humanoid.getNormalizedBoneNode('rightUpperArm');
      
      // Rotate ~70 degrees down on Z axis
      if (leftUpperArm) leftUpperArm.rotation.z = 70 * (Math.PI / 180); 
      if (rightUpperArm) rightUpperArm.rotation.z = -70 * (Math.PI / 180);

      // Slight bend in elbows for natural look
      const leftLowerArm = vrmInstance.humanoid.getNormalizedBoneNode('leftLowerArm');
      const rightLowerArm = vrmInstance.humanoid.getNormalizedBoneNode('rightLowerArm');
      
      if (leftLowerArm) leftLowerArm.rotation.z = 0.1;
      if (rightLowerArm) rightLowerArm.rotation.z = -0.1;
      
      setVrm(vrmInstance);
    }
  }, [gltf]);

  useFrame((state, delta) => {
    if (!vrm) return;

    const time = state.clock.elapsedTime;
    const noise = noiseOffsetRef.current;

    // 1. Update VRM physics/IK
    vrm.update(delta);

    // 2. Complex Natural Idle Animation
    const spine = vrm.humanoid.getNormalizedBoneNode('spine');
    const chest = vrm.humanoid.getNormalizedBoneNode('chest'); // Upper chest
    const neck = vrm.humanoid.getNormalizedBoneNode('neck');
    const head = vrm.humanoid.getNormalizedBoneNode('head');

    if (spine) {
      // Main breathing rhythm (slow)
      const breath = Math.sin(time * 1.0); 
      spine.rotation.x = breath * 0.02;
      spine.rotation.y = Math.sin(time * 0.5 + noise) * 0.02; // Slow twist
    }
    
    if (chest) {
      // Slightly offset from spine for fluidity
      chest.rotation.x = Math.sin(time * 1.0 - 0.5) * 0.015;
    }

    if (neck) {
      // Subtle looking around (slower frequency)
      neck.rotation.y = Math.sin(time * 0.3 + noise) * 0.05;
      neck.rotation.z = Math.cos(time * 0.2 + noise) * 0.02; // Slight tilt
    }

    if (head) {
       // Counter rotation or micro movements
       head.rotation.y = Math.sin(time * 0.4 + 2) * 0.03;
       head.rotation.x = Math.sin(time * 1.2) * 0.01; // Micro nod
    }

    // Arm sway with breath
    const leftArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    if (leftArm && rightArm) {
        // Add small offset to the base A-pose rotation
        // Base rotation ~70 deg (1.22 rad)
        const sway = Math.sin(time * 1.5 - 1) * 0.02;
        const baseRot = 70 * (Math.PI / 180);
        leftArm.rotation.z = baseRot + sway;
        rightArm.rotation.z = -baseRot - sway;
    }

    // 3. Lip Sync Logic (Scaled by expressionFactor)
    if (analyser && vrm.expressionManager) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      const binStart = Math.floor(analyser.frequencyBinCount * 0.1);
      const binEnd = Math.floor(analyser.frequencyBinCount * 0.5);
      for (let i = binStart; i < binEnd; i++) {
        sum += dataArray[i];
      }
      const average = sum / (binEnd - binStart);
      const rawVolume = Math.min(1, average / 100); 
      
      // Apply Expression Factor
      const volume = rawVolume * expressionFactor;

      // Reset all vowels first
      vrm.expressionManager.setValue('aa', 0);
      vrm.expressionManager.setValue('ih', 0);
      vrm.expressionManager.setValue('ou', 0);
      vrm.expressionManager.setValue('ee', 0);
      vrm.expressionManager.setValue('oh', 0);

      if (volume > 0.05) {
        const openness = Math.min(1, volume * 1.5);
        vrm.expressionManager.setValue('aa', openness);
        
        const wobble = Math.sin(time * 20);
        if (wobble > 0.5) {
           vrm.expressionManager.setValue('oh', openness * 0.5);
        } else if (wobble < -0.5) {
           vrm.expressionManager.setValue('ih', openness * 0.3);
        }
      }
    }

    // 4. Blinking (Auto)
    blinkTimerRef.current -= delta;
    if (blinkTimerRef.current <= 0) {
      blinkTimerRef.current = Math.random() * 2 + 2; 
      if (vrm.expressionManager) {
        vrm.expressionManager.setValue('blink', 1 * Math.min(1, expressionFactor + 0.2)); // Ensure blink is visible even at low factor
        setTimeout(() => {
             vrm?.expressionManager?.setValue('blink', 0);
        }, 150);
      }
    }

    // 5. Random Expressions (Scaled)
    expressionTimerRef.current -= delta;
    if (expressionTimerRef.current <= 0) {
       expressionTimerRef.current = Math.random() * 5 + 5; 
       const expressions = ['neutral', 'happy', 'relaxed', 'fun'];
       const next = expressions[Math.floor(Math.random() * expressions.length)];
       
       if (vrm.expressionManager) {
         vrm.expressionManager.setValue(currentExpressionRef.current, 0);
         // Apply factor to expression intensity
         vrm.expressionManager.setValue(next, 0.5 * expressionFactor); 
         currentExpressionRef.current = next;
       }
    }
  });

  return <primitive object={gltf.scene} />;
};