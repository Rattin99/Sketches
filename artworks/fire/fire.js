export function fire(p, firePixelsArray) {
    const height = 75;
    const width = 60;
    p.textSize(18);
    p.fill(0);
    p.noStroke();
    const fireChars = " ,;+ltgti!lI?/\\|)(1}{][rcvzjftJUOQocxfXhqwWB8&%$#@"
    let fireString = "";
    for (let i = 0; i < width; i++) {
        const randomCol = Math.floor(p.random(0, width));
        const index = randomCol + width * (height - 1);
        firePixelsArray[index] = Math.floor(p.random(0, fireChars.length));
    }
    for (let i = 0; i < width; i++) {
        const randomCol = Math.floor(p.random(0, width));
        const index = randomCol + width * (height - 1);
        firePixelsArray[index] = 0;
    }
    for (let i = 0; i < width * (height - 1); i++) {
        let averageValue = (
            firePixelsArray[i] * 0.75 +
            firePixelsArray[i + 1] * 0.75 +
            firePixelsArray[i + width] * 1.35 +
            firePixelsArray[i + width + 1] * 1.3
        ) / 4;
        firePixelsArray[i] = Math.floor(averageValue);
        if (!firePixelsArray[i]) firePixelsArray[i] = 0;
        fireString += fireChars[firePixelsArray[i]];
        if (i % width === 0) {
            fireString += "\n"
        }
    }
    p.text(fireString, 0, -580);
}

export function fireColor(p, firePixelsArray) {
    const height = 75;
    const width = 60;
    p.textSize(18);
    p.fill(0);
    p.noStroke();
    const fireChars = " ,;+ltgti!lI?/|)(1}{][rcvzjftJUOQocxfXhqwWB8&%$#@"

    for (let i = 0; i < width; i++) {
        const randomCol = Math.floor(p.random(0, width));
        const index = randomCol + width * (height - 1);
        firePixelsArray[index] = Math.floor(p.random(0, fireChars.length));
    }
    for (let i = 0; i < width; i++) {
        const randomCol = Math.floor(p.random(0, width));
        const index = randomCol + width * (height - 1);
        firePixelsArray[index] = 0;
    }
    for (let i = 0; i < width * (height - 1); i++) {
        let averageValue = (
            firePixelsArray[i] * 0.8 +
            firePixelsArray[i + 1] * 0.8 +
            firePixelsArray[i + width] * 1.4 +
            firePixelsArray[i + width + 1] * 1.4
        ) / 4;
        firePixelsArray[i] = Math.floor(averageValue);
        if (!firePixelsArray[i]) firePixelsArray[i] = 0;
    }

    //draw fire with color
    for (let i = 0; i < width * (height - 1); i++) {
        const x = (i % width) * 10;  // Adjust 10 to match your character spacing
        const y = Math.floor(i / width) * 18;  // 18 matches your textSize

        // Get intensity from 0 to 1
        const intensity = firePixelsArray[i] / fireChars.length;

        if (intensity < 0.2) {

            p.fill(255, 20, 147); // pink

        }
        else if (intensity < 0.5) {
            p.fill(255, 255, 102); //yellow
        }
        else if (intensity < 0.75) {

            p.fill(50, 205, 50);

        }
        else {
            p.fill(0, 183, 235); // cyan


        }

        // Draw the character
        p.text(fireChars[firePixelsArray[i]], x, -570 + y);
    }


}
