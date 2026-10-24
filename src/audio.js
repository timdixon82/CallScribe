export class AudioPipeline {
  constructor({ source, stream, voiceProcessing, onChunk, onStopped }) {
    this.source = source; this.stream = stream; this.voiceProcessing = voiceProcessing; this.onChunk = onChunk; this.onStopped = onStopped;
    this.parts = []; this.sampleCount = 0; this.running = false; this.maxSamples = 8 * 16000;
  }
  async start() {
    this.context = new AudioContext();
    await this.context.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(this.context, 'capture-processor');
    this.node.port.onmessage = ({ data }) => this.receive(new Float32Array(data));
    const source = this.context.createMediaStreamSource(this.stream);
    // Speech-focused local preprocessing: remove low room rumble and stabilise levels.
    this.highPass = this.context.createBiquadFilter(); this.highPass.type = 'highpass';
    this.lowPass = this.context.createBiquadFilter(); this.lowPass.type = 'lowpass';
    this.compressor = this.context.createDynamicsCompressor(); this.compressor.knee.value = 24; this.compressor.attack.value = 0.003; this.compressor.release.value = 0.25;
    this.setVoiceProcessing(this.voiceProcessing || { highPass: 20, lowPass: 20000, threshold: 0, ratio: 1 });
    source.connect(this.highPass).connect(this.lowPass).connect(this.compressor).connect(this.node);
    this.node.connect(this.context.destination);
    this.stream.getAudioTracks().forEach((track) => { track.onended = () => this.stop(); });
    this.running = true;
  }
  setVoiceProcessing(settings) { if (!settings || !this.highPass) return; this.highPass.frequency.value = settings.highPass; this.lowPass.frequency.value = settings.lowPass; this.compressor.threshold.value = settings.threshold; this.compressor.ratio.value = settings.ratio; }
  receive(samples) {
    if (!this.running) return;
    const resampled = resample(samples, this.context.sampleRate, 16000);
    this.parts.push(resampled); this.sampleCount += resampled.length;
    if (this.sampleCount >= this.maxSamples) this.flush();
  }
  flush() {
    if (!this.sampleCount) return;
    const audio = new Float32Array(this.sampleCount); let offset = 0;
    for (const part of this.parts) { audio.set(part, offset); offset += part.length; }
    this.parts = []; this.sampleCount = 0;
    const energy = audio.reduce((sum, value) => sum + value * value, 0) / audio.length;
    if (energy > 0.00001) this.onChunk({ source: this.source, audio, capturedAt: Date.now() });
  }
  stop() {
    if (!this.running) return;
    this.flush(); this.running = false; this.node?.disconnect(); this.highPass?.disconnect(); this.lowPass?.disconnect(); this.compressor?.disconnect(); this.context?.close();
    this.stream.getTracks().forEach((track) => track.stop()); this.onStopped?.(this.source);
  }
}

function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const output = new Float32Array(Math.round(samples.length * toRate / fromRate));
  for (let index = 0; index < output.length; index += 1) output[index] = samples[Math.min(samples.length - 1, Math.round(index * fromRate / toRate))];
  return output;
}
