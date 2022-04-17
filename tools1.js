

// circle at (x,y) withcommon radius l and color

const drawCircle = (cx,cy,color,l,deviance) =>{

    
    noStroke();
    fill(color)
    beginShape()

    for(let i =0; i<=720;i++){
        const r = l + random(0,deviance);
        curveVertex(cx+r*cos(i),cy+r*sin(i))
    }

    endShape();
}