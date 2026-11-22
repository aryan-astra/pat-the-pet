export function createPurr() {
  let audio;
  let voice;
  let volume;
  let enabled = false;
  let level = 0;

  function build() {
    audio = new AudioContext();
    volume = audio.createGain();
    volume.gain.value = 0;
    volume.connect(audio.destination);

    const length = 6;
    const sampleRate = 16000;
    const buffer = audio.createBuffer(1, length * sampleRate, sampleRate);
    const samples = buffer.getChannelData(0);
    const tau = Math.PI * 2;
    let seed = 17437;
    let low = 0;
    let high = 0;

    for (let index = 0; index < samples.length; index++) {
      const time = index / sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      low += .045 * (noise - low);
      high += .2 * (noise - high);

      const breath = Math.sin(tau * time / 3);
      const phase = tau * 26 * time + .62 * Math.sin(tau * time / 1.5);
      const flutter = .38 + .62 * ((1 + Math.sin(phase)) / 2) ** 2;
      const rumble = .54 * Math.sin(phase * 2) + .25 * Math.sin(phase * 3 + .5)
        + .15 * Math.sin(phase * 5) + .06 * Math.sin(phase * 8);
      const grain = Math.min(index / 160, (samples.length - 1 - index) / 160, 1);
      samples[index] = (.72 + .22 * breath) * flutter
        * (.43 * rumble + grain * (.36 * low + .14 * high));
    }

    voice = audio.createBufferSource();
    voice.buffer = buffer;
    voice.loop = true;
    voice.connect(volume);
    voice.start();
  }

  function sync() {
    if (!volume) return;
    const target = enabled && !document.hidden ? level * .48 : 0;
    volume.gain.setTargetAtTime(target, audio.currentTime, target ? .11 : .2);
  }

  return {
    async unlock() {
      if (!enabled || document.hidden) return;
      if (!audio) build();
      if (audio.state !== "running") await audio.resume();
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
