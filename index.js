let canvas = document.createElement("canvas");
canvas.width = 640;
canvas.height = 480;
canvas.style["image-rendering"] = "pixelated";
canvas.style.width = canvas.width * 1.5 + "px";
canvas.style.height = canvas.height * 1.5 + "px";
document.body.appendChild(canvas);

let camPosX = 0;
let camPosY = 0;
let camPosZ = 0;
let camRotation = Matrix.identity(3);

let moonPosX = 150;
let moonPosY = 30;
let moonPosZ = 70;
let moonRad = 3;

let planetPosX = 125;
let planetPosY = 20;
let planetPosZ = 90;
let planetRad = 10;

let lightPosX = -100;
let lightPosY = 0;
let lightPosZ = 50;
let lightRad = 100;

let starCount = 1000;
let starPos = new Matrix(3, starCount);

// randomize star positions 
let tmp = new Matrix(3, 1);
tmp.data = [
	[1],
	[0],
	[0],
];
for (let i = 0; i < starCount; i++) {
	tmp.rotate(Math.random() * 360, Math.random() * 360);
	starPos.setColumn(i, tmp.getColumn(0));
}

let ctx = canvas.getContext("2d");

let pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

window.keysDown = {};
window.addEventListener("keydown", (e) => {
	keysDown[e.key] = true;
});

window.addEventListener("keyup", (e) => {
	delete keysDown[e.key];
});

let mouseX = 0;
let mouseY = 0;
let rotSpeed = 5;
let slowSpeed = 0.1;
let fastSpeed = 0.5;
let moveSpeed = slowSpeed;
let FOV = 1;
canvas.onclick = function() {
	canvas.requestPointerLock();
};

canvas.addEventListener("mousemove", (e) => {
	mouseX += e.movementX;
	mouseY += e.movementY;
	camRotation = Matrix.identity(3).rotate(
		(mouseY / canvas.height * 2 - 1) * Math.PI * rotSpeed,
		(mouseX / canvas.width * 2 - 1) * Math.PI * rotSpeed,
	);
});

function worldToLocal(x, y, z) {
	let localPos = new Matrix(3, 1)
	localPos.data = [
		[x - camPosX],
		[y - camPosY],
		[z - camPosZ],
	];

	// Note: Matrix.transpose should be outside of this function, and called only once per render frame
	localPos = Matrix.multiply(Matrix.transpose(camRotation), localPos);

	return {
		x: localPos.data[0][0],
		y: localPos.data[1][0],
		z: localPos.data[2][0]
	};
}

function projectPlanet(x, y, z, r) {
	if (z < 0) return;

	x /= z / FOV;
	y /= z / FOV;

	return {
		x: (x + 1) / 2 * canvas.width,
		y: (1 - (y + 1) / 2) * canvas.height,
		r: r * FOV / z * canvas.width
	};
}

function calculateLightMap(lX, lY, lZ, pX, pY, pZ) {
	// transform the planets position vector to be directly infront of the camera (so it is centered along the camera's Z axis and the visible face of the circle is parallel with the local x axis)
	// let A represent the set of movements/rotations that the previous vector went through
	// apply transformation A to the sun position vector, so that the light is still hitting the planet at the same angle

	let yAngle = 90 - Math.atan2(pZ, pX) / Math.PI * 180;
	let xAngle = Math.atan2(pY, pZ) / Math.PI * 180;

	let rotMatrix = Matrix.rotationMatrix3x3(xAngle, -yAngle, 0);

	let lightMapR = lightMap.width / 2;
	let between = new Matrix(3, 1);
	between.data = [
		[lX-pX],
		[lY-pY],
		[lZ-pZ],
	];

	let betweenRot = Matrix.multiply(rotMatrix, between);

	let betweenX = betweenRot.data[0][0];
	let betweenY = betweenRot.data[1][0];
	let betweenZ = betweenRot.data[2][0];
	let betweenLength = Math.sqrt(betweenX ** 2 + betweenY ** 2 + betweenZ ** 2);

	// assumes planet is directly ahead of us
	for (let y = 0; y < lightMap.height; y++) {
		for (let x = 0; x < lightMap.width; x++) {
			let index = (x + y * lightMap.width) * 4;
			if (lightMap.pixels[index] === 255) continue;

			let normX = (x - lightMapR) / lightMapR;
			let normY = (lightMapR - y) / lightMapR;
			let normZ = -Math.sqrt(1 - normX ** 2 - normY ** 2);

			let lightMultiplyer = 1 - (betweenX * normX + betweenY * normY + betweenZ * normZ) / betweenLength;
			
			// Or 0 because normZ can be NaN at edge cases (due to low res pixel inaccuracy) there is probably a better way
			lightMap.pixels[index + 3] = 255 * lightMultiplyer | 0;

		}
	}
}

function blendPixels(image, posX, posY, width, height) {
	let stepX = image.width / width;
	let stepY = image.height / height;

	let firstIX = posX < 0 ? Math.floor(stepX * Math.abs(posX)) : 0;

	let imageX = firstIX;
	let imageY = posY < 0 ? Math.floor(stepY * Math.abs(posY)) : 0;

	if (posX < 0) {
		width += posX;
	}

	if (posY < 0) {
		height += posY;
	}

	posX = Math.max(0, posX);
	posY = Math.max(0, posY);

	if (posX + width > canvas.width) {
		width += canvas.width - (posX + width)
	}

	if (posY + height > canvas.height) {
		height += canvas.height - (posY + height)
	}

	posX = Math.min(posX, canvas.width);
	posY = Math.min(posY, canvas.height);

	for (let y = posY; y < posY + height; y++) {
		for (let x = posX; x < posX + width; x++) {
			let canvasIndex = (x + y * canvas.width) * 4;
			let imageIndex = (Math.floor(imageX) + Math.floor(imageY) * image.width) * 4;
			let alphaWeight = image.pixels[imageIndex + 3] / 255;
			pixels[canvasIndex] = pixels[canvasIndex] * (1 - alphaWeight) + image.pixels[imageIndex] * alphaWeight;
			pixels[canvasIndex + 1] = pixels[canvasIndex + 1] * (1 - alphaWeight) + image.pixels[imageIndex + 1] * alphaWeight;
			pixels[canvasIndex + 2] = pixels[canvasIndex + 2] * (1 - alphaWeight) + image.pixels[imageIndex + 2] * alphaWeight;
			pixels[canvasIndex + 3] = 255;
			imageX += stepX;
		}
		imageY += stepY;
		imageX = firstIX;
	}
}

function getPixels(image) {
	let tempCanvas = document.createElement("canvas");
	let ctx = tempCanvas.getContext("2d");

	tempCanvas.width = image.width;
	tempCanvas.height = image.height;

	ctx.drawImage(
		image,
		0,
		0,
		tempCanvas.width,
		tempCanvas.height
	);

	return ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
}

function loadImage(path, onload) {
	let image = {
		html: new Image(),
		pixels: undefined,
		width: 0,
		height: 0
	};
	image.html.addEventListener("load", function() {
		image.pixels = getPixels(image.html).data;
		image.width = image.html.width;
		image.height = image.html.height;
		if (onload)
			onload(image);
	});
	image.html.src = path;
	return image;
}

let lightMap = loadImage("ShadowMap.png", function(image) {
	for (let y = 0; y < image.height; y++) {
		for (let x = 0; x < image.width; x++) {
			let index = (x + y * image.width) * 4;
			if (image.pixels[index] === 255) {
				image.pixels[index + 3] = 0;
			}
		}
	}
});
let moon = loadImage("moon.png");
let planet = loadImage("earthLike.png");
let sun = loadImage("sun.png");

function renderLoop() {
	requestAnimationFrame(renderLoop);
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

	let camInverse = Matrix.transpose(camRotation);

	let localStars = Matrix.multiply(camInverse, starPos);

	ctx.fillStyle = "rgba(200, 200, 200, 1)";
	for (let i = 0; i < starCount; i++) {
		let screenPos = projectPlanet(
			localStars.data[0][i],
			localStars.data[1][i],
			localStars.data[2][i],
			0,
		);
		if(screenPos != undefined) 
			ctx.fillRect(screenPos.x, screenPos.y, 1, 1);
	}
	ctx.fillStyle = "black";

	pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

	let lightLocalCoords = worldToLocal(lightPosX, lightPosY, lightPosZ);
	if (sun.pixels != undefined) {
		let screenSun = projectPlanet(lightLocalCoords.x, lightLocalCoords.y, lightLocalCoords.z, lightRad);
		if (screenSun != undefined) {
			ctx.drawImage(
				sun.html,
				Math.floor(screenSun.x - screenSun.r / 2),
				Math.floor(screenSun.y - screenSun.r / 2),
				Math.floor(screenSun.r),
				Math.floor(screenSun.r)
			);
			pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		}
	}

	if (moon.pixels != undefined) {
		let moonLocalCoords = worldToLocal(moonPosX, moonPosY, moonPosZ);
		let screenMoon = projectPlanet(moonLocalCoords.x, moonLocalCoords.y, moonLocalCoords.z, moonRad);
		if (screenMoon != undefined) {
			calculateLightMap(
				lightLocalCoords.x,
				lightLocalCoords.y,
				lightLocalCoords.z,
				moonLocalCoords.x,
				moonLocalCoords.y,
				moonLocalCoords.z,
			);
			ctx.drawImage(
				moon.html,
				Math.floor(screenMoon.x - screenMoon.r / 2),
				Math.floor(screenMoon.y - screenMoon.r / 2),
				Math.floor(screenMoon.r),
				Math.floor(screenMoon.r)
			);
			pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			blendPixels(
				lightMap,
				Math.floor(screenMoon.x - screenMoon.r / 2),
				Math.floor(screenMoon.y - screenMoon.r / 2),
				Math.floor(screenMoon.r),
				Math.floor(screenMoon.r)
			);
		}
	}

	ctx.putImageData(new ImageData(pixels, canvas.width), 0, 0);

	if (planet.pixels != undefined) {
		let planetLocalCoords = worldToLocal(planetPosX, planetPosY, planetPosZ);
		let screenPlanet = projectPlanet(planetLocalCoords.x, planetLocalCoords.y, planetLocalCoords.z, planetRad);
		if (screenPlanet != undefined) {
			calculateLightMap(
				lightLocalCoords.x,
				lightLocalCoords.y,
				lightLocalCoords.z,
				planetLocalCoords.x,
				planetLocalCoords.y,
				planetLocalCoords.z,
			);
			ctx.drawImage(
				planet.html,
				Math.floor(screenPlanet.x - screenPlanet.r / 2),
				Math.floor(screenPlanet.y - screenPlanet.r / 2),
				Math.floor(screenPlanet.r),
				Math.floor(screenPlanet.r)
			);
			pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			blendPixels(
				lightMap,
				Math.floor(screenPlanet.x - screenPlanet.r / 2),
				Math.floor(screenPlanet.y - screenPlanet.r / 2),
				Math.floor(screenPlanet.r),
				Math.floor(screenPlanet.r)
			);
		}
	}

	if (keysDown["w"]) {
		camPosX += camRotation.data[0][2] * moveSpeed;
		camPosY += camRotation.data[1][2] * moveSpeed;
		camPosZ += camRotation.data[2][2] * moveSpeed;
	}

	if (keysDown["s"]) {
		camPosX -= camRotation.data[0][2] * moveSpeed;
		camPosY -= camRotation.data[1][2] * moveSpeed;
		camPosZ -= camRotation.data[2][2] * moveSpeed;
	}

	if (keysDown["a"]) {
		camPosX -= camRotation.data[0][0] * moveSpeed;
		camPosY -= camRotation.data[1][0] * moveSpeed;
		camPosZ -= camRotation.data[2][0] * moveSpeed;
	}

	if (keysDown["d"]) {
		camPosX += camRotation.data[0][0] * moveSpeed;
		camPosY += camRotation.data[1][0] * moveSpeed;
		camPosZ += camRotation.data[2][0] * moveSpeed;
	}

	if (keysDown[" "]) moveSpeed = fastSpeed;
	else moveSpeed = slowSpeed;
	ctx.putImageData(new ImageData(pixels, canvas.width), 0, 0);
}

renderLoop();