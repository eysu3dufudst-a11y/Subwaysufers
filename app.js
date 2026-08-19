(function () {
    var scene = new THREE.Scene();
    
    // 🌌 1. 하늘 배경 & 안개 효과
    scene.background = new THREE.Color(0x1e1b4b);
    scene.fog = new THREE.FogExp2(0x1e1b4b, 0.012);

    var getWidth = function() { return window.innerWidth || 360; };
    var getHeight = function() { return window.innerHeight || 360; };

    var camera = new THREE.PerspectiveCamera(60, getWidth() / getHeight(), 0.1, 1000);
    
    // 🖥️ WebGL 호환성 강화 렌더러
    var renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch (e) {
        renderer = new THREE.CanvasRenderer();
    }
    
    var size = Math.min(getWidth(), getHeight());
    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
    document.body.appendChild(renderer.domElement);

    // 🎵 2. BGM 오디오 객체
    var bgm = new Audio('bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.6;

    // 🔊 3. Web Audio API 엔진
    var audioCtx = null;
    function initAudioContext() {
        if (!audioCtx) {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function enableAudio() {
        initAudioContext();
        if (bgm.paused) {
            var playPromise = bgm.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(error) {});
            }
        }
    }

    // 자체 점프 사운드
    function playJumpSound() {
        if (!audioCtx) return;
        try {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            var now = audioCtx.currentTime;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

            osc.start(now);
            osc.stop(now + 0.15);
        } catch(e) {}
    }

    // 자체 게임오버 사운드
    function playGameOverSound() {
        if (!audioCtx) return;
        try {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            var now = audioCtx.currentTime;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);

            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

            osc.start(now);
            osc.stop(now + 0.4);
        } catch(e) {}
    }

    // 조명
    var ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);
    var dirLight = new THREE.DirectionalLight(0xffd166, 1.0);
    dirLight.position.set(10, 30, 20);
    scene.add(dirLight);

    // 🛣️ 4. 땅(도로) 무한 이동 트랙
    var trackGeometry = new THREE.PlaneGeometry(16, 200);
    var trackMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x111827, 
        roughness: 0.8 
    });
    var track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.position.z = -80;
    scene.add(track);

    // 차선 구분선
    var laneLines = [];
    for (var i = 0; i < 20; i++) {
        for (var l = -1; l <= 1; l += 2) {
            var lineGeo = new THREE.PlaneGeometry(0.3, 4);
            var lineMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
            var line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(l * 2.5, 0.02, -i * 10);
            scene.add(line);
            laneLines.push(line);
        }
    }

    var laneX = [-3.5, 0, 3.5];
    var currentLane = 1;
    var player = null;

    // 🦘 점프 변수
    var isJumping = false;
    var jumpVelocity = 0;
    var gravity = 0.025;
    var jumpPower = 0.55;

    // 🎨 5. Jake 캐릭터 로드 (타 브라우저 텍스처 차단 방지 적용)
    var textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous'); // 크로스 오리진 차단 방지
    
    textureLoader.load('IMG_2483.png', function (texture) {
        var material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5 });

        var objLoader = new THREE.OBJLoader();
        objLoader.load('Jake Taller.obj', function (object) {
            player = object;

            player.traverse(function (child) {
                if (child.isMesh) child.material = material;
            });

            player.scale.set(1.2, 1.2, 1.2); 
            player.rotation.y = Math.PI; 
            player.position.set(laneX[currentLane], 0, -2);

            scene.add(player);
        });
    });

    // 🎯 카메라 구도
    camera.position.set(0, 5.5, 9);
    camera.lookAt(0, 2, -10);

    var obstacles = [];
    var gameSpeed = 999;
    var isGameOver = false;

    // 장애물 생성
    function spawnObstacle() {
        var lane = Math.floor(Math.random() * 3);
        var obsGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
        var obsMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
        var obs = new THREE.Mesh(obsGeo, obsMat);
        
        obs.position.set(laneX[lane], 1.1, -100);
        obs.lane = lane;
        scene.add(obs);
        obstacles.push(obs);
    }

    var frameCount = 0;
    var animClock = 0;

    // 🏃‍♂️ 메인 프레임 루프
    function animate() {
        requestAnimationFrame(animate);

        if (!isGameOver) {
            animClock += 0.15;

            if (player) {
                player.position.x += (laneX[currentLane] - player.position.x) * 0.2;

                if (isJumping) {
                    player.position.y += jumpVelocity;
                    jumpVelocity -= gravity;

                    if (player.position.y <= 0) {
                        player.position.y = 0;
                        isJumping = false;
                        jumpVelocity = 0;
                    }
                } else {
                    player.position.y = Math.abs(Math.sin(animClock * 2)) * 0.25;
                    player.rotation.z = Math.sin(animClock) * 0.08;
                }
            }

            for (var k = 0; k < laneLines.length; k++) {
                laneLines[k].position.z += gameSpeed;
                if (laneLines[k].position.z > 10) {
                    laneLines[k].position.z -= 200;
                }
            }

            frameCount++;
            if (frameCount % 35 === 0) {
                spawnObstacle();
            }

            for (var i = obstacles.length - 1; i >= 0; i--) {
                var obs = obstacles[i];
                obs.position.z += gameSpeed;

                if (player) {
                    var isSameLane = (obs.lane === currentLane);
                    var isCloseZ = Math.abs(obs.position.z - player.position.z) < 1.8;
                    var isLowY = (player.position.y < 1.8);

                    if (isSameLane && isCloseZ && isLowY) {
                        isGameOver = true;
                        playGameOverSound();
                        bgm.pause();
                    }
                }

                if (obs.position.z > 10) {
                    scene.remove(obs);
                    obstacles.splice(i, 1);
                }
            }
        }

        renderer.render(scene, camera);
    }

    // 🎮 이벤트 제어
    var touchStartY = 0;
    var touchStartX = 0;

    window.addEventListener('touchstart', function (e) {
        enableAudio();

        if (isGameOver) {
            resetGame();
            return;
        }

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });

    window.addEventListener('click', function () {
        enableAudio();
    });

    window.addEventListener('touchend', function (e) {
        if (isGameOver) return;

        var touchEndX = e.changedTouches[0].clientX;
        var touchEndY = e.changedTouches[0].clientY;

        var diffX = touchEndX - touchStartX;
        var diffY = touchEndY - touchStartY;

        if (diffY < -30 && Math.abs(diffY) > Math.abs(diffX)) {
            triggerJump();
        } else if (Math.abs(diffX) > 30) {
            if (diffX < 0 && currentLane > 0) currentLane--;
            else if (diffX > 0 && currentLane < 2) currentLane++;
        } else {
            var screenHeight = window.innerHeight;
            var screenWidth = window.innerWidth;

            if (touchStartY < screenHeight * 0.35) {
                triggerJump();
            } else if (touchStartX < screenWidth / 2) {
                if (currentLane > 0) currentLane--;
            } else {
                if (currentLane < 2) currentLane++;
            }
        }
    });

    function triggerJump() {
        if (!isJumping) {
            isJumping = true;
            jumpVelocity = jumpPower;
            playJumpSound();
        }
    }

    window.addEventListener('rotarydetent', function (e) {
        enableAudio();

        if (isGameOver) {
            resetGame();
            return;
        }

        if (e.detail.direction === 'CW' && currentLane < 2) {
            currentLane++;
        } else if (e.detail.direction === 'CCW' && currentLane > 0) {
            currentLane--;
        }
    });

    function resetGame() {
        for (var i = 0; i < obstacles.length; i++) scene.remove(obstacles[i]);
        obstacles = [];
        currentLane = 1;
        isJumping = false;
        jumpVelocity = 0;
        
        if (player) {
            player.position.set(laneX[currentLane], 0, -2);
            player.rotation.z = 0;
        }

        bgm.currentTime = 0;
        bgm.play().catch(function(){});
        isGameOver = false;
    }

    window.addEventListener('resize', function () {
        var newSize = Math.min(getWidth(), getHeight());
        renderer.setSize(newSize, newSize);
    });

    window.addEventListener('tizenhwkey', function (e) {
        if (e.keyName === 'back') {
            try { tizen.application.getCurrentApplication().exit(); } catch (ignore) {}
        }
    });

    animate();
})();

