const getSqr = () =>{
    return  class Sqr {
        constructor(w,wparent,xparent,yparent,color, layer){
    
            this.layer = layer;
            this.w = w;
            this.xparent = xparent;
            this.yparent = yparent;
            if(layer == 1) {
                this.x = random(-width / 2 + w /2, width /2 - w/2)
                this.y = random(-height /2 + w/2, width /2 - w/2)
            }else {
                this.x = random(-wparent /2 + w/2,wparent /2 -w/2);
                this.y = random(-wparent /2 + w/2, wparent /2 -w/2);
            }
           
    
            this.color = color;
    
            this.children = []
        }
    
        createChildren() {
            if(this.w > 20){
                for(let i = 0; i<10; i++){
    
                    let color = [this.color[0] + random(100),this.color[1] + random(100),this.color[2] + random(100)]
                    let sqr = Sqr(this.w * random(0.05, 0.5), this.w,this.x,this.y,color,this.layer+1)
    
                    if(i === 0){
                        this.children.push(sqr)
                    } else {
                        for(let j =0; j<this.children.length;j++){
                            if(abs(sqr.x - this.children[j].x) < sqr.w /2 + this.children[j].w /2 && abs(sqr.y - this.children[j].y) < sqr.w /2 + this.children[j].w /2){
                                break;
                            }else if ( j === this.children.length -1) {
                                this.children.push(sqr)
                            }
                        }
                    }
                }
            }
        }
    
        show() {
           
            fill(this.color)
            translate(this.xparent, this.yparent)
            rect(this.x,this.y,this.w,this.w,this.w/20)
    
    
            for(let i = 0;i< this.children.length; i++){
                push()
    
                this.children[i].createChildren()
                this.children[i].show()
    
                pop()
            }
        }
    }
}