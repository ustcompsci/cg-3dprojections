import * as CG from './transforms.js';
import { Matrix, Vector } from "./matrix.js";

const LEFT = 32; // binary 100000
const RIGHT = 16; // binary 010000
const BOTTOM = 8;  // binary 001000
const TOP = 4;  // binary 000100
const FAR = 2;  // binary 000010
const NEAR = 1;  // binary 000001
const FLOAT_EPSILON = 0.000001;

class Renderer {
    // canvas:              object ({id: __, width: __, height: __})
    // scene:               object (...see description on Canvas)
    constructor(canvas, scene) {
        this.canvas = document.getElementById(canvas.id);
        this.canvas.width = canvas.width;
        this.canvas.height = canvas.height;
        this.ctx = this.canvas.getContext('2d');
        this.scene = this.processScene(scene);
        this.enable_animation = true;  // <-- disable for easier debugging; enable for animation
        this.start_time = null;
        this.prev_time = null;
    }

    //
    updateTransforms(time, delta_time) {
        // TODO: update any transformations needed for animation

        for (let model of this.scene.models) {
            if (model.hasOwnProperty('animation')) {
                let elapsedSeconds = (time - this.start_time) / 1000;
                let theta = 2 * Math.PI * model.animation.rps * elapsedSeconds;
                let rotation = new Matrix(4, 4);
                if (model.animation.axis === 'x') {
                    CG.mat4x4RotateX(rotation, theta);
                } else if (model.animation.axis === 'y') {
                    CG.mat4x4RotateY(rotation, theta);
                } else if (model.animation.axis === 'z') {
                    CG.mat4x4RotateZ(rotation, theta);
                }
                let translate = new Matrix(4, 4);
                CG.mat4x4Translate(translate, -model.center.x, -model.center.y, -model.center.z);
                let translateBack = new Matrix(4, 4);
                CG.mat4x4Translate(translateBack, model.center.x, model.center.y, model.center.z);
                model.matrix = Matrix.multiply([translateBack, rotation, translate]);
            }
        }
    }

    //
    rotateLeft() {
        this.rotateSRPAroundVAxis(-1);
    }

    //
    rotateRight() {
        this.rotateSRPAroundVAxis(1);
    }

    //
    rotateSRPAroundVAxis(angle) {
        let radians = angle * (Math.PI / 180);
        let rotationMatrix = new Matrix(4, 4);
        CG.mat4x4RotateY(rotationMatrix, radians);

        let prp = this.scene.view.prp;
        let srp = this.scene.view.srp;

        let translationToPRP = new Matrix(4, 4);
        CG.mat4x4Translate(translationToPRP, -prp.x, -prp.y, -prp.z);

        let translationBackFromPRP = new Matrix(4, 4);
        CG.mat4x4Translate(translationBackFromPRP, prp.x, prp.y, prp.z);

        let srpHomogeneous = CG.Vector4(srp.x, srp.y, srp.z, 1);
        let newSRPHomogeneous = Matrix.multiply([translationBackFromPRP, rotationMatrix, translationToPRP, srpHomogeneous]);

        this.scene.view.srp = CG.Vector3(newSRPHomogeneous.x, newSRPHomogeneous.y, newSRPHomogeneous.z);
    }

    //
    moveLeft() {
        let u = this.scene.view.vup.cross(this.scene.view.prp.subtract(this.scene.view.srp));
        u.normalize();
        this.scene.view.prp = this.scene.view.prp.add(u);
        this.scene.view.srp = this.scene.view.srp.add(u);
    }

    //
    moveRight() {
        let u = this.scene.view.vup.cross(this.scene.view.srp.subtract(this.scene.view.prp));
        u.normalize();
        this.scene.view.prp = this.scene.view.prp.add(u);
        this.scene.view.srp = this.scene.view.srp.add(u);
    }

    //
    moveBackward() {
        let n = this.scene.view.srp.subtract(this.scene.view.prp);
        n.normalize();
        this.scene.view.prp = this.scene.view.prp.add(n);
        this.scene.view.srp = this.scene.view.srp.add(n);
    }

    //
    moveForward() {
        let n = this.scene.view.prp.subtract(this.scene.view.srp);
        n.normalize();
        this.scene.view.prp = this.scene.view.prp.add(n);
        this.scene.view.srp = this.scene.view.srp.add(n);
    }

    //
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // TODO: implement drawing here!

        let perspectiveMatrix = CG.mat4x4Perspective(this.scene.view.prp, this.scene.view.srp, this.scene.view.vup, this.scene.view.clip);
        let mper = CG.mat4x4MPer();
        let viewport = CG.mat4x4Viewport(this.canvas.width, this.canvas.height);

        // For each model
        for (let model of this.scene.models) {
            let vertices = [];

            if (model.type === 'generic') {
                vertices = model.vertices;
            } else if (model.type === 'cube') {
                vertices = this.generateCubeVertices(model.center, model.width, model.height, model.depth);
            } else if (model.type === 'cone') {
                vertices = this.generateConeVertices(model.center, model.radius, model.height, model.sides);
            } else if (model.type === 'cylinder') {
                vertices = this.generateCylinderVertices(model.center, model.radius, model.height, model.sides);
            } else if (model.type === 'sphere') {
                vertices = this.generateSphereVertices(model.center, model.radius, model.slices, model.stacks);
            }

            // For each vertex, transform endpoints to canonical view volume
            let transformedVertices = vertices.map(vertex => {
                let modelTransformed = Matrix.multiply([model.matrix, vertex]);
                return Matrix.multiply([perspectiveMatrix, modelTransformed]);
            });

            let edges = [];
            if (model.type === 'generic') {
                edges = model.edges;
            } else if (model.type === 'cube') {
                edges = this.generateCubeEdges();
            } else if (model.type === 'cone') {
                edges = this.generateConeEdges(model.sides);
            } else if (model.type === 'cylinder') {
                edges = this.generateCylinderEdges(model.sides);
            } else if (model.type === 'sphere') {
                edges = this.generateSphereEdges(model.slices, model.stacks);
            }

            // For each line segment in each edge
            for (let edge of edges) {
                for (let i = 0; i < edge.length - 1; i++) {
                    let pt0 = transformedVertices[edge[i]];
                    let pt1 = transformedVertices[edge[i + 1]];

                    // Clip in 3D
                    let clippedLine = this.clipLinePerspective({ pt0, pt1 }, this.scene.view.clip[4]);

                    if (clippedLine) {

                        // Project to 2D
                        let pt0Projected = Matrix.multiply([mper, clippedLine.pt0]);
                        let pt1Projected = Matrix.multiply([mper, clippedLine.pt1]);

                        // Translate/Scale to viewport (i.e. window)
                        pt0Projected = Matrix.multiply([viewport, pt0Projected]);
                        pt1Projected = Matrix.multiply([viewport, pt1Projected]);

                        // Draw line
                        this.drawLine(
                            pt0Projected.x / pt0Projected.w, pt0Projected.y / pt0Projected.w,
                            pt1Projected.x / pt1Projected.w, pt1Projected.y / pt1Projected.w
                        );
                    }
                }
            }
        }
    }

    // Get outcode for a vertex
    // vertex:       Vector4 (transformed vertex in homogeneous coordinates)
    // z_min:        float (near clipping plane in canonical view volume)
    outcodePerspective(vertex, z_min) {
        let outcode = 0;
        if (vertex.x < (vertex.z - FLOAT_EPSILON)) {
            outcode += LEFT;
        }
        else if (vertex.x > (-vertex.z + FLOAT_EPSILON)) {
            outcode += RIGHT;
        }
        if (vertex.y < (vertex.z - FLOAT_EPSILON)) {
            outcode += BOTTOM;
        }
        else if (vertex.y > (-vertex.z + FLOAT_EPSILON)) {
            outcode += TOP;
        }
        if (vertex.z < (-1.0 - FLOAT_EPSILON)) {
            outcode += FAR;
        }
        else if (vertex.z > (z_min + FLOAT_EPSILON)) {
            outcode += NEAR;
        }
        return outcode;
    }

    // Clip line - should either return a new line (with two endpoints inside view volume)
    //             or null (if line is completely outside view volume)
    // line:         object {pt0: Vector4, pt1: Vector4}
    // z_min:        float (near clipping plane in canonical view volume)
    clipLinePerspective(line, z_min) {
        let result = null;
        let p0 = line.pt0;
        let p1 = line.pt1;
        let out0 = this.outcodePerspective(p0, z_min);
        let out1 = this.outcodePerspective(p1, z_min);

        // TODO: implement clipping here!

        while (true) {
            if (!(out0 | out1)) {
                result = { pt0: p0, pt1: p1 };
                break;
            } else if (out0 & out1) {
                break;
            } else {
                let outcodeOut = out0 ? out0 : out1;
                let x, y, z, t;
                if (outcodeOut & TOP) {
                    t = (-p0.z - p0.y) / (p1.y - p0.y + p1.z - p0.z);
                } else if (outcodeOut & BOTTOM) {
                    t = (p0.z - p0.y) / (p1.y - p0.y - p1.z + p0.z);
                } else if (outcodeOut & RIGHT) {
                    t = (-p0.z - p0.x) / (p1.x - p0.x + p1.z - p0.z);
                } else if (outcodeOut & LEFT) {
                    t = (p0.z - p0.x) / (p1.x - p0.x - p1.z + p0.z);
                } else if (outcodeOut & FAR) {
                    t = (-1 - p0.z) / (p1.z - p0.z);
                } else if (outcodeOut & NEAR) {
                    t = (z_min - p0.z) / (p1.z - p0.z);
                }

                x = p0.x + t * (p1.x - p0.x);
                y = p0.y + t * (p1.y - p0.y);
                z = p0.z + t * (p1.z - p0.z);

                if (outcodeOut === out0) {
                    p0 = CG.Vector4(x, y, z, 1);
                    out0 = this.outcodePerspective(p0, z_min);
                } else {
                    p1 = CG.Vector4(x, y, z, 1);
                    out1 = this.outcodePerspective(p1, z_min);
                }
            }
        }
        return result;
    }

    //
    animate(timestamp) {
        // Get time and delta time for animation
        if (this.start_time === null) {
            this.start_time = timestamp;
            this.prev_time = timestamp;
        }
        let time = timestamp - this.start_time;
        let delta_time = timestamp - this.prev_time;

        // Update transforms for animation
        this.updateTransforms(time, delta_time);

        // Draw slide
        this.draw();

        // Invoke call for next frame in animation
        if (this.enable_animation) {
            window.requestAnimationFrame((ts) => {
                this.animate(ts);
            });
        }

        // Update previous time to current one for next calculation of delta time
        this.prev_time = timestamp;
    }

    //
    updateScene(scene) {
        this.scene = this.processScene(scene);
        if (!this.enable_animation) {
            this.draw();
        }
    }

    //
    processScene(scene) {
        let processed = {
            view: {
                prp: CG.Vector3(scene.view.prp[0], scene.view.prp[1], scene.view.prp[2]),
                srp: CG.Vector3(scene.view.srp[0], scene.view.srp[1], scene.view.srp[2]),
                vup: CG.Vector3(scene.view.vup[0], scene.view.vup[1], scene.view.vup[2]),
                clip: [...scene.view.clip]
            },
            models: []
        };

        for (let i = 0; i < scene.models.length; i++) {
            let model = { type: scene.models[i].type };
            if (model.type === 'generic') {
                model.vertices = [];
                model.edges = JSON.parse(JSON.stringify(scene.models[i].edges));
                for (let j = 0; j < scene.models[i].vertices.length; j++) {
                    model.vertices.push(CG.Vector4(scene.models[i].vertices[j][0],
                        scene.models[i].vertices[j][1],
                        scene.models[i].vertices[j][2],
                        1));
                }
            }
            else {
                model.center = CG.Vector3(scene.models[i].center[0],
                    scene.models[i].center[1],
                    scene.models[i].center[2]);
                for (let key in scene.models[i]) {
                    if (scene.models[i].hasOwnProperty(key) && key !== 'type' && key !== 'center') {
                        model[key] = JSON.parse(JSON.stringify(scene.models[i][key]));
                    }
                }
            }

            if (scene.models[i].hasOwnProperty('animation')) {
                model.animation = JSON.parse(JSON.stringify(scene.models[i].animation));
            }

            model.matrix = new Matrix(4, 4);
            processed.models.push(model);
        }

        return processed;
    }

    // x0:           float (x coordinate of p0)
    // y0:           float (y coordinate of p0)
    // x1:           float (x coordinate of p1)
    // y1:           float (y coordinate of p1)
    drawLine(x0, y0, x1, y1) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.moveTo(x0, y0);
        this.ctx.lineTo(x1, y1);
        this.ctx.stroke();

        this.ctx.fillStyle = '#FF0000';
        this.ctx.fillRect(x0 - 2, y0 - 2, 4, 4);
        this.ctx.fillRect(x1 - 2, y1 - 2, 4, 4);
    }

    // Generate vertices for a cube
    generateCubeVertices(center, width, height, depth) {
        let vertices = [];
        let halfWidth = width / 2;
        let halfHeight = height / 2;
        let halfDepth = depth / 2;

        vertices.push(CG.Vector4(center.x - halfWidth, center.y - halfHeight, center.z - halfDepth, 1));
        vertices.push(CG.Vector4(center.x + halfWidth, center.y - halfHeight, center.z - halfDepth, 1));
        vertices.push(CG.Vector4(center.x + halfWidth, center.y + halfHeight, center.z - halfDepth, 1));
        vertices.push(CG.Vector4(center.x - halfWidth, center.y + halfHeight, center.z - halfDepth, 1));
        vertices.push(CG.Vector4(center.x - halfWidth, center.y - halfHeight, center.z + halfDepth, 1));
        vertices.push(CG.Vector4(center.x + halfWidth, center.y - halfHeight, center.z + halfDepth, 1));
        vertices.push(CG.Vector4(center.x + halfWidth, center.y + halfHeight, center.z + halfDepth, 1));
        vertices.push(CG.Vector4(center.x - halfWidth, center.y + halfHeight, center.z + halfDepth, 1));

        return vertices;
    }

    // Generate edges for a cube
    generateCubeEdges() {
        return [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];
    }

    // Generate vertices for a cone
    generateConeVertices(center, radius, height, sides) {
        let vertices = [];
        let angleStep = (2 * Math.PI) / sides;

        vertices.push(CG.Vector4(center.x, center.y, center.z, 1));

        for (let i = 0; i <= sides; i++) {
            let angle = i * angleStep;
            let x = center.x + radius * Math.cos(angle);
            let z = center.z + radius * Math.sin(angle);
            vertices.push(CG.Vector4(x, center.y - height / 2, z, 1));
        }

        return vertices;
    }

    // Generate edges for a cone
    generateConeEdges(sides) {
        let edges = [];

        for (let i = 1; i <= sides; i++) {
            edges.push([0, i]);
            edges.push([i, i + 1]);
        }
        edges.push([1, sides + 1]);

        return edges;
    }

    // Generate vertices for a cylinder
    generateCylinderVertices(center, radius, height, sides) {
        let vertices = [];
        let angleStep = (2 * Math.PI) / sides;

        for (let i = 0; i <= sides; i++) {
            let angle = i * angleStep;
            let x = center.x + radius * Math.cos(angle);
            let z = center.z + radius * Math.sin(angle);
            vertices.push(CG.Vector4(x, center.y - height / 2, z, 1));
            vertices.push(CG.Vector4(x, center.y + height / 2, z, 1));
        }

        return vertices;
    }

    // Generate edges for a cylinder
    generateCylinderEdges(sides) {
        let edges = [];

        for (let i = 0; i < sides; i++) {
            edges.push([i * 2, i * 2 + 1]); 
            edges.push([i * 2, (i * 2 + 2) % (sides * 2)]);
            edges.push([i * 2 + 1, (i * 2 + 3) % (sides * 2)]);
        }

        return edges;
    }

    // Generate vertices for a sphere
    generateSphereVertices(center, radius, slices, stacks) {
        let vertices = [];
        let stackStep = Math.PI / stacks;
        let sliceStep = (2 * Math.PI) / slices;

        for (let i = 0; i <= stacks; i++) {
            let stackAngle = i * stackStep;
            let z = radius * Math.cos(stackAngle);
            let xy = radius * Math.sin(stackAngle);

            for (let j = 0; j <= slices; j++) {
                let sliceAngle = j * sliceStep;
                let x = xy * Math.cos(sliceAngle);
                let y = xy * Math.sin(sliceAngle);
                vertices.push(CG.Vector4(center.x + x, center.y + z, center.z + y, 1));
            }
        }

        return vertices;
    }

    // Generate edges for a sphere
    generateSphereEdges(slices, stacks) {
        let edges = [];

        for (let i = 0; i < stacks; i++) {
            for (let j = 0; j < slices; j++) {
                let current = i * (slices + 1) + j;
                let next = current + 1;
                let above = (i + 1) * (slices + 1) + j;
                let aboveNext = above + 1;

                edges.push([current, next]);
                edges.push([current, above]);

                if (i === stacks - 1) {
                    edges.push([above, aboveNext]);
                }
                if (j === slices - 1) {
                    edges.push([next, aboveNext]);
                }
            }
        }

        return edges;
    }
};

export { Renderer };
