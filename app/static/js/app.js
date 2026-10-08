let currentCapturedImageBase64 = null;
let recognition = null;
let isRecordingVoice = false;
let currentGPS = "Trail Location";

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    loadSightings();
    loadQuests();
    loadBenchmarks();
    requestRealGPS();
});

// Real GPS & Location Tracker (Browser Geolocation + Backend Fallback)
async function requestRealGPS() {
    const coordsElem = document.getElementById('gps-coords');
    const elevElem = document.getElementById('gps-elev');

    // First try browser native geolocation
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(4);
                const lon = pos.coords.longitude.toFixed(4);
                const elev = pos.coords.altitude ? `${pos.coords.altitude.toFixed(0)} m` : "Local Elevation";
                currentGPS = `${lat}° N, ${lon}° E`;
                if (coordsElem) coordsElem.textContent = currentGPS;
                if (elevElem) elevElem.textContent = elev;
            },
            async (err) => {
                // If browser GPS permission denied/delayed on desktop, fetch from backend location API
                try {
                    const res = await fetch('/api/location');
                    const loc = await res.json();
                    if (loc.status === 'success') {
                        currentGPS = `${loc.coords} (${loc.location_name})`;
                        if (coordsElem) coordsElem.textContent = currentGPS;
                        if (elevElem) elevElem.textContent = loc.elevation;
                    }
                } catch (e) {
                    if (coordsElem) coordsElem.textContent = "28.58° N, 77.33° E (Local Trail)";
                }
            },
            { timeout: 4000, enableHighAccuracy: true }
        );
    } else {
        try {
            const res = await fetch('/api/location');
            const loc = await res.json();
            if (loc.status === 'success' && coordsElem) {
                coordsElem.textContent = `${loc.coords} (${loc.location_name})`;
            }
        } catch (e) {}
    }
}

// Live Camera Photo Capture & Upload
function handleLiveCameraUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        currentCapturedImageBase64 = e.target.result;
        
        // Show preview box
        const previewBox = document.getElementById('camera-preview-box');
        const previewImg = document.getElementById('camera-preview-img');
        if (previewBox && previewImg) {
            previewImg.src = currentCapturedImageBase64;
            previewBox.classList.remove('hidden');
        }

        // Auto populate hint if empty
        const input = document.getElementById('flora-input');
        if (!input.value.trim()) {
            input.value = "Wild forest specimen photo";
        }

        // Auto trigger identification
        identifySpecimen();
    };
    reader.readAsDataURL(file);
}

function clearCapturedPhoto() {
    currentCapturedImageBase64 = null;
    const previewBox = document.getElementById('camera-preview-box');
    if (previewBox) previewBox.classList.add('hidden');
    document.getElementById('camera-file-input').value = "";
}

// Live Microphone Voice Dictation (Hands-free Trail Voice AI)
function toggleVoiceDictation() {
    const btn = document.getElementById('voice-dict-btn');
    const input = document.getElementById('flora-input');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Voice recognition is not supported in this browser. You can type or snap a photo!");
        return;
    }

    if (isRecordingVoice && recognition) {
        recognition.stop();
        isRecordingVoice = false;
        btn.classList.remove('text-red-400', 'animate-pulse');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isRecordingVoice = true;
        btn.classList.add('text-red-400', 'animate-pulse');
        input.placeholder = "Listening... Describe what you see on the trail!";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        btn.classList.remove('text-red-400', 'animate-pulse');
        isRecordingVoice = false;
        identifySpecimen();
    };

    recognition.onerror = (event) => {
        console.error('Speech error:', event);
        btn.classList.remove('text-red-400', 'animate-pulse');
        isRecordingVoice = false;
    };

    recognition.onend = () => {
        btn.classList.remove('text-red-400', 'animate-pulse');
        isRecordingVoice = false;
    };

    recognition.start();
}

// Tab Switching
function switchTab(tab) {
    currentTab = tab;
    ['scan', 'journal', 'quests', 'bench'].forEach(t => {
        const section = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tab-${t}-btn`);
        if (t === tab) {
            section.classList.remove('hidden');
            btn.classList.add('border-amber-500', 'text-amber-400');
            btn.classList.remove('border-transparent', 'text-stone-400');
        } else {
            section.classList.add('hidden');
            btn.classList.remove('border-amber-500', 'text-amber-400');
            btn.classList.add('border-transparent', 'text-stone-400');
        }
    });
    lucide.createIcons();
}

function quickFill(text) {
    document.getElementById('flora-input').value = text;
    identifySpecimen();
}

// AI Specimen Identification
async function identifySpecimen() {
    const input = document.getElementById('flora-input').value.trim();
    if (!input) return;

    const loading = document.getElementById('loading-state');
    const resultCard = document.getElementById('result-card');
    const identifyBtn = document.getElementById('identify-btn');

    loading.classList.remove('hidden');
    resultCard.classList.add('hidden');
    identifyBtn.disabled = true;

    try {
        const response = await fetch('/api/identify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: input, use_tinker_model: true })
        });

        const res = await response.json();
        if (res.status === 'success') {
            currentResult = res.data;
            renderResultCard(res.data);
        }
    } catch (err) {
        console.error('Identification failed:', err);
        alert('Identification failed. Please check network or try again.');
    } finally {
        loading.classList.add('hidden');
        identifyBtn.disabled = false;
        lucide.createIcons();
    }
}

function renderResultCard(data) {
    const card = document.getElementById('result-card');
    document.getElementById('res-name').textContent = data.species_name;
    document.getElementById('res-scientific').textContent = data.scientific_name;
    document.getElementById('res-category').textContent = data.category;
    document.getElementById('res-action').textContent = data.field_action_item;
    document.getElementById('res-lookalikes').textContent = data.toxic_lookalikes.join(' | ');

    // Specimen image & habitat
    const imgElem = document.getElementById('res-image');
    imgElem.src = data.image_url || 'https://images.unsplash.com/photo-1543883345-7a35402a6f71?w=800';
    imgElem.alt = data.species_name;

    const habitatText = document.getElementById('res-habitat-text');
    if (habitatText) {
        habitatText.textContent = data.habitat || 'Woodland floor & trail borders';
    }

    // Badge color
    const badge = document.getElementById('res-badge');
    badge.textContent = data.edibility_status;
    if (data.edibility_status.toLowerCase().includes('toxic') || data.edibility_status.toLowerCase().includes('poisonous')) {
        badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-950 border border-red-500/40 text-red-400";
    } else if (data.edibility_status.toLowerCase().includes('caution')) {
        badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-950 border border-amber-500/40 text-amber-400";
    } else {
        badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-950 border border-emerald-500/40 text-emerald-400";
    }

    // Bullets
    const bulletsList = document.getElementById('res-bullets');
    bulletsList.innerHTML = '';
    data.key_identification_points.forEach(point => {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-2';
        li.innerHTML = `<span class="text-amber-400 mt-0.5 font-bold">•</span> <span>${point}</span>`;
        bulletsList.appendChild(li);
    });

    // Model metadata
    document.getElementById('res-model-info').textContent = 
        `${data.model_metadata.inference_engine} | Latency: ${data.model_metadata.latency_ms}ms | Confidence: ${(data.confidence_score * 100).toFixed(0)}%`;

    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Spoken Audio Card Playback (Minimal Screen Time)
function playSpokenFieldCard() {
    if (!currentResult || !currentResult.audio_speech_script) return;

    const btnText = document.getElementById('audio-btn-text');
    const waveAnim = document.getElementById('soundwave-anim');

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // stop previous
        const utterance = new SpeechSynthesisUtterance(currentResult.audio_speech_script);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        btnText.textContent = 'Speaking...';
        if (waveAnim) waveAnim.classList.remove('hidden');

        utterance.onend = () => { 
            btnText.textContent = 'Listen Spoken Card'; 
            if (waveAnim) waveAnim.classList.add('hidden');
        };
        utterance.onerror = () => { 
            btnText.textContent = 'Listen Spoken Card'; 
            if (waveAnim) waveAnim.classList.add('hidden');
        };

        window.speechSynthesis.speak(utterance);
    } else {
        alert('Text-to-speech audio script:\n\n' + currentResult.audio_speech_script);
    }
}

// Save Sighting to Backboard Memory
async function saveCurrentToBackboard() {
    if (!currentResult) return;
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;

    try {
        const response = await fetch('/api/log-sighting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                species_name: currentResult.species_name,
                scientific_name: currentResult.scientific_name,
                category: currentResult.category,
                safety_rating: currentResult.edibility_status,
                confidence: currentResult.confidence_score,
                notes: currentResult.key_identification_points.join('. '),
                trail_location: 'Whispering Pines Trail'
            })
        });

        const res = await response.json();
        if (res.status === 'success') {
            saveBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i> Saved to Backboard!`;
            setTimeout(() => {
                saveBtn.innerHTML = `<i data-lucide="bookmark" class="w-4 h-4"></i> Save to Backboard`;
                saveBtn.disabled = false;
            }, 2500);
            loadSightings();
            loadQuests();
        }
    } catch (e) {
        console.error('Failed to save to Backboard:', e);
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="bookmark" class="w-4 h-4"></i> Save to Backboard`;
    }
    lucide.createIcons();
}

// Load Sightings from Backboard
async function loadSightings() {
    try {
        const res = await fetch('/api/sightings');
        const data = await res.json();
        const list = document.getElementById('sightings-list');
        const countSpan = document.getElementById('sighting-count');

        if (data.status === 'success') {
            countSpan.textContent = data.data.length;
            list.innerHTML = '';

            if (data.data.length === 0) {
                list.innerHTML = `<div class="text-stone-500 text-center py-8 text-sm">No trail sightings logged yet. Go outside, identify a plant, and save it!</div>`;
                return;
            }

            data.data.forEach(s => {
                const item = document.createElement('div');
                item.className = 'glass-panel p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-stone-800';
                
                const isToxic = s.safety_rating.toLowerCase().includes('toxic') || s.safety_rating.toLowerCase().includes('caution');
                const badgeColor = isToxic ? 'bg-red-950/60 text-red-400 border-red-800/40' : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40';

                item.innerHTML = `
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-stone-100">${s.species_name}</span>
                            <span class="text-xs italic text-stone-400">(${s.scientific_name})</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}">${s.safety_rating}</span>
                        </div>
                        <p class="text-xs text-stone-400">${s.notes || 'Identified along trail expedition.'}</p>
                        <div class="text-[11px] text-stone-500 flex items-center gap-3">
                            <span>📍 ${s.trail_location}</span>
                            <span>⏱️ ${new Date(s.timestamp).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-[10px] px-2 py-1 bg-stone-900 border border-stone-800 text-stone-400 rounded-md flex items-center gap-1">
                            <i data-lucide="cloud-check" class="w-3 h-3 text-blue-400"></i> Backboard Synced
                        </span>
                    </div>
                `;
                list.appendChild(item);
            });
        }
    } catch (e) {
        console.error('Failed to load sightings:', e);
    }
    lucide.createIcons();
}

// Load Quests
async function loadQuests() {
    try {
        const res = await fetch('/api/quests');
        const data = await res.json();
        const list = document.getElementById('quests-list');

        if (data.status === 'success') {
            list.innerHTML = '';
            data.data.forEach(q => {
                const card = document.createElement('div');
                card.className = `glass-panel p-5 rounded-2xl border ${q.completed ? 'border-emerald-600/40 bg-emerald-950/20' : 'border-stone-800'} space-y-3 flex flex-col justify-between`;
                
                const percent = Math.min(100, Math.round((q.progress / q.target) * 100));

                card.innerHTML = `
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold px-2.5 py-0.5 rounded-full ${q.completed ? 'bg-emerald-900 text-emerald-300' : 'bg-stone-800 text-stone-400'}">
                                ${q.completed ? '✓ Completed' : 'In Progress'}
                            </span>
                            <span class="text-xs font-semibold text-amber-400 flex items-center gap-1">
                                <i data-lucide="medal" class="w-3.5 h-3.5"></i> ${q.badge}
                            </span>
                        </div>
                        <h3 class="font-bold text-stone-100 text-sm">${q.title}</h3>
                        <p class="text-xs text-stone-400">${q.description}</p>
                    </div>

                    <div class="space-y-1.5 pt-2 border-t border-stone-800/60">
                        <div class="flex justify-between text-xs text-stone-400">
                            <span>Progress</span>
                            <span class="font-medium text-stone-200">${q.progress} / ${q.target}</span>
                        </div>
                        <div class="w-full bg-stone-900 rounded-full h-2 overflow-hidden border border-stone-800">
                            <div class="bg-gradient-to-r from-amber-500 to-emerald-500 h-2 transition-all duration-500" style="width: ${percent}%"></div>
                        </div>
                    </div>
                `;
                list.appendChild(card);
            });
        }
    } catch (e) {
        console.error('Failed to load quests:', e);
    }
    lucide.createIcons();
}

// Load Tinker Benchmarks
async function loadBenchmarks() {
    try {
        const res = await fetch('/api/benchmarks');
        const data = await res.json();
        const grid = document.getElementById('benchmarks-grid');

        if (data.status === 'success') {
            grid.innerHTML = '';
            data.data.metrics.forEach(m => {
                const card = document.createElement('div');
                card.className = 'glass-panel p-5 rounded-2xl border border-stone-800 space-y-3';
                card.innerHTML = `
                    <div class="flex items-center justify-between">
                        <h4 class="font-bold text-sm text-stone-200">${m.metric}</h4>
                        <span class="text-xs font-bold px-2 py-0.5 bg-emerald-950 border border-emerald-500/40 text-emerald-400 rounded-full">
                            ${m.improvement}
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div class="p-2.5 bg-stone-900/90 rounded-xl border border-stone-800/80">
                            <span class="text-stone-500 block">Base Open LLM</span>
                            <span class="text-sm font-semibold text-stone-400">${m.base_model}</span>
                        </div>
                        <div class="p-2.5 bg-emerald-950/30 rounded-xl border border-emerald-800/40">
                            <span class="text-emerald-500 block">Tinker Fine-Tuned</span>
                            <span class="text-sm font-bold text-emerald-400">${m.tinker_tuned}</span>
                        </div>
                    </div>
                    <p class="text-xs text-stone-400 leading-relaxed">${m.significance}</p>
                `;
                grid.appendChild(card);
            });
        }
    } catch (e) {
        console.error('Failed to load benchmarks:', e);
    }
    lucide.createIcons();
}
