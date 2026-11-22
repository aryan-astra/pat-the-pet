const recording = new URL("../assets/audio/bertie-purr.mp3", import.meta.url);

export function createPurr() {
  let audio;
  let volume;
  let loading;
  let enabled = false;
  let level = 0;

  function sync() {
    if (!volume) return;
    const target = enabled && !document.hidden ? level * .67 : 0;
    volume.gain.setTargetAtTime(target, audio.currentTime, target ? .16 : .24);
  }

  async function loadRecording() {
    const response = await fetch(recording);
    if (!response.ok) throw new Error("The purr recording could not be loaded.");
    const decoded = await audio.decodeAudioData(await response.arrayBuffer());
    const voice = audio.createBufferSource();
    voice.buffer = decoded;
    voice.loop = true;
    voice.connect(volume);
    voice.start();
  }

  return {
    async unlock() {
      if (!enabled || document.hidden) return;
      if (!audio) {
        audio = new AudioContext();
        volume = audio.createGain();
        volume.gain.value = 0;
        volume.connect(audio.destination);
      }
      const resume = audio.state === "running" ? undefined : audio.resume();
      loading ??= loadRecording().catch(error => {
        loading = undefined;
        throw error;
      });
      await Promise.all([resume, loading]);
      sync();
    },
    enable(value) {
      enabled = value;
      sync();
    },
    update(value) {
      level = value;
      sync();
    },
  };
}
