import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ShaderMaterial } from "three";
import vertexShader from "../../assets/shaders/vertex.glsl";
import fragmentShader from "../../assets/shaders/fragment.glsl";
import "../../styles/shaderBackground.css";

function ShaderPlane({ vertical = false}: { vertical?: boolean}){
    const materialRef = useRef<ShaderMaterial>(null);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uResolution: {value: new THREE.Vector2(0,0)},
        uVertical: {value: vertical ? 1.0 : 0.0 },
    }), [vertical]);

    useFrame((state) => {
        if(materialRef.current){
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            materialRef.current.uniforms.uResolution.value.set(state.size.width, state.size.height);
        }
    });

    return(
        <mesh>
            <planeGeometry args={[2,2]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
            />
        </mesh>
    )
}

function ShaderBackground({ vertical = false }: { vertical?: boolean }){
    return(
        <div className={`shaderBackground${vertical ? " shaderBackgroundVertical" : ""}`}>
            <div className="dummyShader"></div>
            <div className="dummyShader2"></div>
            <div className="dummyCircle"></div>
            <Canvas>
                <ShaderPlane vertical= {vertical}/>
            </Canvas>
            <div className="dummyShader3"></div>
            <div className="dummyShader4"></div>
            <div className="shaderHider"/>
        </div>
    )
}

export default ShaderBackground;