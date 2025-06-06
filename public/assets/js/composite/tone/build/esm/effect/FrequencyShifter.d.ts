import { Frequency } from "../core/type/Units.js";
import { Effect, EffectOptions } from "../effect/Effect.js";
import { Signal } from "../signal/Signal.js";
export interface FrequencyShifterOptions extends EffectOptions {
    frequency: Frequency;
}
/**
 * FrequencyShifter can be used to shift all frequencies of a signal by a fixed amount.
 * The amount can be changed at audio rate and the effect is applied in real time.
 * The frequency shifting is implemented with a technique called single side band modulation using a ring modulator.
 * Note: Contrary to pitch shifting, all frequencies are shifted by the same amount,
 * destroying the harmonic relationship between them. This leads to the classic ring modulator timbre distortion.
 * The algorithm will produces some aliasing towards the high end, especially if your source material
 * contains a lot of high frequencies. Unfortunatelly the webaudio API does not support resampling
 * buffers in real time, so it is not possible to fix it properly. Depending on the use case it might
 * be an option to low pass filter your input before frequency shifting it to get ride of the aliasing.
 * You can find a very detailed description of the algorithm here: https://larzeitlin.github.io/RMFS/
 *
 * @example
 * const input = new Tone.Oscillator(230, "sawtooth").start();
 * const shift = new Tone.FrequencyShifter(42).toDestination();
 * input.connect(shift);
 * @category Effect
 */
export declare class FrequencyShifter extends Effect<FrequencyShifterOptions> {
    readonly name: string;
    /**
     * The ring modulators carrier frequency. This frequency determines
     * by how many Hertz the input signal will be shifted up or down. Default is 0.
     */
    readonly frequency: Signal<"frequency">;
    /**
     * The ring modulators sine carrier
     */
    private _sine;
    /**
     * The ring modulators cosine carrier
     */
    private _cosine;
    /**
     * The sine multiply operator
     */
    private _sineMultiply;
    /**
     * The cosine multiply operator
     */
    private _cosineMultiply;
    /**
     * The negate operator
     */
    private _negate;
    /**
     * The final add operator
     */
    private _add;
    /**
     * The phase shifter to create the initial 90° phase offset
     */
    private _phaseShifter;
    /**
     * @param frequency The incoming signal is shifted by this frequency value.
     */
    constructor(frequency?: Frequency);
    constructor(options?: Partial<FrequencyShifterOptions>);
    static getDefaults(): FrequencyShifterOptions;
    dispose(): this;
}
