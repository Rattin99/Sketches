


const f = (l,color) =>{
    const cx = randomGaussian(width/2,100);
    const cy = randomGaussian(height/2,100);
    

    noStroke();
    fill(color)
    beginShape()

    for(let i =0; i<=360;i++){
        const r = l+ random(0,30);
        curveVertex(cx+r*cos(i),cy+r*sin(i))
    }

    endShape();
}

const daisys = () => {

    const pallete = ['#c0a6b3','#32ad8d','#a47ea9','#74b0a5'];

   

    
    
    for(let i = 0; i<200; i++){

        const index = Math.floor(random(0,pallete.length));
        const color = pallete[index];

        
        
    }
    const r = random(1,150);

    drawCircle(width/2,height/2,'#000',r,100)
}


