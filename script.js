function setup() {

    canvas = createCanvas(1440, 900);
    canvas.parent("container");

    noLoop();

   
    
}

const Color = getColorClass();
const color = new Color(242, 5, 159, 2.75)


function draw() {

    background(255,255,255);

    // paint(100,100,100,color);
   
     her()

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


