
function drawGon(){
    let points = ngon(200,200,50,5);
    console.log(points);
    beginShape();
    for(let i =0;i<points.length;i++){
        console.log(points[i].a,points[i].b);
        vertex(points[i].a,points[i].b);
    }
    endShape(CLOSE);
}