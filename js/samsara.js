


function circ(x,y,r){
    return {
        x,
        y,
        r
    }
}


function samsara(){
    const universes = [];

    if(universes.length == 0) universes.push(gen());

    for(let j = 0; j < 1000 ; j++){
        const u = gen();
        let bool = true;
        for(let i = 0; i < universes.length; i++){

            if(!compare(universes[i],u)) {
                bool = false;
                break;
            }
        }

        if(bool) universes.push(u);
    
    }

    for(let i = 0; i<universes.length;i++){
        let u = universes[i];

        britto(u.x,u.y, u.r);
    }

}

function britto(x,y,r){

    const palette = get_Pallette();

    console.log(palette)

    noStroke()
    fill(palette[Math.floor(Math.random()*palette.length)])
    ellipse(x,y,2*r);

    const parent = circ(x,y,r);
    
    let children = [];

    if(r > 5){
        for(let i = 0; i<1000; i++){
            const cr = random(0,r/2);
            const cx = random(x-r,x+r)
            const cy = random(y-r,y+r)
            const c = circ(cx,cy,cr)

            if(children.length == 0) {
                if(check(parent,c)) children.push(c);
            }
            else{
                let bool = true;
                for(let j = 0; j< children.length;j++){
                    if(!compare(children[j],c)){
                        bool = false;
                        break;
                    }
                    if(!check(parent,c)){
                        bool = false;
                        break;
                    }
                }
                if(bool) children.push(c);
            }
        }
    }

    for(let i = 0; i< children.length; i++){
        const c = children[i];
        
        noStroke()
        fill(palette[Math.floor(Math.random()*palette.length)])
        ellipse(c.x,c.y,c.r);
        britto(c.x,c.y,c.r)
    }
}

function compare(circle1,circle2){
    let d = dist(circle1.x,circle1.y,circle2.x,circle2.y)

    return d > circle1.r + circle2.r;
}

function check(parent,child){
    let d = dist(parent.x,parent.y,child.x,child.y) + child.r;

    return d < parent.r
}

function gen(){
    const x = random(width);
    const y = random(height);
    const r = random(width/6);

    return circ(x,y,r);
}

function get_Pallette(){

    

    const pallette1 = ['#0C0F40','#E362BB','#0C0F40','#16F2B4','#E9413F'];
    const pallette2 = ['#0D05F2', '#0D01DA', '#F53533', '#10EA76', '#F2CB07'];
    const pallette3 = ['#F2059F','#EE05F2','#5005F2','#EAF205', '#F27405']

    
    const pallettes = [pallette1,pallette2,pallette3];

    return pallettes[Math.floor(Math.random()*pallettes.length)]


}