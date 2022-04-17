

function mouth(width,height){
    let lines = []

    let y = 50;
    for(let i = 0; i< 20;i++){
        let points = [];
         
        for(let j = -10;j<100;j++){
            points.push({x:j*10,y:y})
        }

        lines.push(points);
        y += 50;
    }



    return lines;
}

function scream(lines){
    
}


function drawMouth (lines){

    lines.map((value,index) =>{


        beginShape()
        value.map((value,index) =>{
            curveVertex(value.x,value.y)
        })
        endShape()
    })
}