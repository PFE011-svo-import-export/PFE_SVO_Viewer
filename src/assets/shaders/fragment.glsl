//fragment.glsl
//Uniform
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

float sdfCircle(vec2 p, float radius){
    return length(p) - radius;
}

float random(vec2 st){
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123)/2.0;
}

//A smooth version of abs(): same value away from zero, but rounds off
//the sharp corner right at zero instead of having an abrupt slope change.
//abs()'s corner is invisible in the raw distance value, but shows up as
//a seam once lighting reads the SDF's gradient across the mirror fold.
float smoothAbs(float x, float k){
    return sqrt(x*x + k*k) - k;
}

float sdfArch(vec2 p, float radius, float height){
    p.x = smoothAbs(p.x, 0.02);

    float dome = length(p) - radius; //Distance euclydienne
    float pillar = p.x - radius; 

    if(p.y > 0.0){
        return dome;
    }else{
        return pillar;
    }
}

void main(){
    //Convert the Origin of the shape to the center of the shape
    vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
    const int nbOfCircle = 5;

    float offsetCoefficient = 0.1;
    float baseRadius = 0.68;
    vec2 center = vec2(uv.x - uResolution.x/uResolution.y + baseRadius + (float(nbOfCircle-1)*offsetCoefficient), uv.y);
    float thickness = 0.003;
    float aa = 0.001;

    vec3 outerColor = vec3(0.35, 0.08, 0.05);
    vec3 innerColor = vec3(1.0, 0.7, 0.55);

    //Generate shape
    //Arches
    vec3 color = vec3(0.0);
    //Tracks whether ANY shape (a ring or the circle) covers this pixel -
    //drives the final alpha so untouched background stays fully
    //transparent instead of painting black over the page's own CSS.
    float coverage = 0.0;
    for(int i = 0; i < nbOfCircle; i++){
        float offset = float(nbOfCircle - 2 - i) * offsetCoefficient;
        vec2 archPos = center;

        float radius = baseRadius + offset;
        float height = baseRadius + offset;

        float currentArchSigned = sdfArch(archPos.yx, radius, height);

        float ringMask = 1.0 - smoothstep(-aa, aa, currentArchSigned);

        float t = float(i) / float(nbOfCircle - 1);
        vec3 ringColor = mix(outerColor, innerColor, t);

        float eps = 0.001;
        float gradX = sdfArch((archPos + vec2(eps, 0.0)).yx, radius, height)
                    - sdfArch((archPos - vec2(eps, 0.0)).yx, radius, height);
        float gradY = sdfArch((archPos + vec2(0.0, eps)).yx, radius, height)
                    - sdfArch((archPos - vec2(0.0, eps)).yx, radius, height);
        vec2 normal = normalize(vec2(gradX, gradY));

        vec2 lightDir = normalize(vec2(1.0, -0.10));
        float diffuse = dot(normal, lightDir);
        float shade = mix(0.5, 1.3, diffuse * 0.5 + 0.5);
        ringColor *= shade;

        color = mix(color, ringColor, ringMask);
        coverage = max(coverage, ringMask);
    }

    //Circle
    float circleSigned = sdfCircle(center, baseRadius - offsetCoefficient * 3.0);
    float circleMask = 1.0 - smoothstep(thickness - aa, thickness + aa, circleSigned);
    color = mix(color, vec3(1.0, 0.05, 0.1), circleMask);
    coverage = max(coverage, circleMask);

    //Circle Border
    float borderThickness = 0.01;
    float circleBorderMask = 1.0 - smoothstep(borderThickness - aa, borderThickness + aa, abs(circleSigned));
    color = mix(color, vec3(0.0), circleBorderMask);
    coverage = max(coverage, circleBorderMask);

    float grainFade = 1.0 - vUv.x;
    float grain = random(gl_FragCoord.xy + uTime) - 0.5;
    color += grain * 0.5 * grainFade*2.0;
    color += grain * 0.3 * circleMask;

    //Render
    gl_FragColor = vec4(color, coverage * 0.75);
}


