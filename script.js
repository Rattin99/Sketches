

function setup() {

    canvas = createCanvas(600, 750);
    canvas.parent("container");

    noLoop();


   
    
}




function draw() {

    background(255,255,255);

    drawMouth(mouth())

}







window.addEventListener('keydown', (e) => {
    if (e.keyCode == 13) {
        loop();
    }
    if (e.keyCode == 32) {
        noLoop();
    }
    if (e.keyCode == 83) {
        saveCanvas(canvas, `mysketch${random(5000)}`, 'png');
    }
    if (e.keyCode == 82) {
        redraw();
    }
    if (e.keyCode == 76) {
        window.location.reload();
    }
});


