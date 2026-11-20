import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'

export type Vec3 = [number, number, number]

/** Puts the shared camera into a scene's starting pose when that scene mounts. */
export function useCameraPose(position: Vec3, target: Vec3, fov = 55): void {
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    camera.position.set(...position)
    camera.lookAt(...target)
    const persp = camera as PerspectiveCamera
    if (persp.isPerspectiveCamera) {
      persp.fov = fov
      persp.updateProjectionMatrix()
    }
    // Pose is applied once per mount on purpose (position/target are literals per scene).
  }, [camera])
}
