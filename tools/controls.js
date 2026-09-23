// Generic keyboard controls shared by every artwork's p5 instance.
// Enter = loop, Space = pause, S = save PNG, R = redraw one frame, L = reload page.
export function attachControls(p, canvas) {
    window.addEventListener('keydown', (e) => {
        switch (e.keyCode) {
            case 13: // Enter
                p.loop();
                break;
            case 32: // Space
                p.noLoop();
                break;
            case 83: // S
                p.saveCanvas(canvas, `sketch-${Math.floor(p.random(5000))}`, 'png');
                break;
            case 82: // R
                p.redraw();
                break;
            case 76: // L
                window.location.reload();
                break;
        }
    });
}
