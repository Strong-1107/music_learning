import { ToneAudioBuffer } from "https://esm.sh/tone";

import { bus } from "./data/EventBus.js";
import { SongOptions } from "./data/SongOptions.js";
import { MidiData } from "./midi/Data.js";
import { History } from "./history/History.js";

import { Sound } from "./sound/Sound.js";

const buffer = new ToneAudioBuffer();

const songOptions = new SongOptions();
const midiData = new MidiData();
const sound = new Sound(songOptions, midiData);

let isPlaying = false;
let stopRequested = false;
let currentPlaybackTimeout = null;
let isResizing = false;

// Define time signature first
let currentTimeSignature = "4/4";
let numColumns = 32; // Will be updated based on time signature

// Define notes from highest to lowest
const buttonNote = ["Do", "Ti", "La", "Sol", "Fa", "Mi", "Re", "Do"];
const noteIndex = [60, 59, 57, 55, 53, 52, 50, 48];
const noteColor = [
  "#e33059",
  "#ea57b2",
  "#5b37cc",
  "#11826d",
  "#95c631",
  "#edd929",
  "#f7943d",
  "#e33059",
];

// Initialize noteGroup array
// Change from array of arrays to array of arrays of note objects
// noteGroup[column] = [{ row: 3, duration: '8' }, ...]
let noteGroup = [];
for (let i = 0; i < numColumns; i++) {
  noteGroup.push([]);
}

// Note duration types and mapping to VexFlow
const NOTE_DURATIONS = {
  EIGHTH: '8',
  QUARTER: 'q',
  HALF: 'h',
  WHOLE: 'w'
};
const DURATION_TO_SPAN = {
  '8': 1,
  'q': 2,
  'h': 4,
  'w': 8
};
const DURATION_LABELS = {
  '8': '1/8',
  'q': '1/4',
  'h': '1/2',
  'w': '1'
};

// Helper to check if a note can be placed (no overlap)
function canPlaceNote(column, duration) {
  const span = DURATION_TO_SPAN[duration];
  for (let i = 0; i < span; i++) {
    if (noteGroup[column + i] && noteGroup[column + i].length > 0) {
      // If any spanned column already has a note starting, block
      if (noteGroup[column + i].some(n => n.start)) return false;
    }
  }
  return true;
}

// Helper to clear notes in a span
function clearSpan(column, duration) {
  const span = DURATION_TO_SPAN[duration];
  for (let i = 0; i < span; i++) {
    if (noteGroup[column + i]) noteGroup[column + i] = [];
  }
}

const notePair = ["c/4", "d/4", "e/4", "f/4", "g/4", "a/4", "b/4", "c/5"];
const EasePair = ["qr", "q", "q", "q", "q", "q", "q", "q"];

// Initialize grid container
const gridContainer = document.getElementById("noteGroup");
if (gridContainer) {
    gridContainer.style.gridTemplateColumns = `repeat(${numColumns}, 1fr)`;
    initializeGrid(); // Call initializeGrid after setting up the container
}

// Add drag selection variables
let isDragging = false;
let lastSelectedButton = null;
let lastSelectedNote = 0;
let selectionStarted = false;
let initialButtonState = false; // true if first button was selected, false if unselected

function initializeGrid() {
    const gridContainer = document.getElementById("noteGroup");
    if (!gridContainer) return;
    
    gridContainer.innerHTML = ""; // Clear existing grid
    
    // Set columns based on time signature
    const columns = currentTimeSignature === "3/4" ? 24 : 32;
    gridContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    // Calculate grouping per measure based on time signature
    const groupSize = currentTimeSignature === "3/4" ? 6 : 8;
    const totalGroups = columns / groupSize;

    // Calculate eighths per measure based on time signature
    const eighthsPerMeasure = groupSize;

    // Reinitialize noteGroup array with new size
    noteGroup = [];
    for (let i = 0; i < columns; i++) {
        noteGroup.push([]);
    }

    for (let i = 1; i <= 10 * columns; i++) {
        const button = document.createElement("button");
        button.classList.add("grid-btn");
        button.setAttribute("data-id", i);
        let indexColumn = (i - 1) % columns;
        let indexRow = Math.floor((i - 1) / columns);  // Direct row calculation (0 = top)

        // Determine group index (0-based)
        const groupIndex = Math.floor(indexColumn / groupSize);
        // If odd-numbered group (1st, 3rd, ...), add odd-group class
        if (groupIndex % 2 === 0) {
            button.classList.add("odd-group");
        }

        if (i <= 8 * columns) {
            if (Math.floor((indexColumn) / (columns/2)) % 2) {
                button.classList.add("oddBtn");
            } else {
                button.classList.add("evenBtn");
            }

            // Add bar dividers based on time signature
            if (indexColumn % eighthsPerMeasure === 0 && indexColumn !== 0) {
                button.classList.add("bar-divider");
            }
            
            // Add last-bar-divider to the last column
            if (indexColumn === columns - 1) {
                button.classList.add("last-bar-divider");
            }

            if (indexColumn % 2 && indexColumn !== 0) {
                button.classList.add("mainDivider");
            }

            // Add event listeners
            button.addEventListener("mousedown", (e) => {
                e.preventDefault(); // Prevent text selection while dragging
                e.stopPropagation(); // Stop event propagation
                
                isDragging = true;
                selectionStarted = true;
                lastSelectedButton = button;

                // Store initial state - if the button was selected or not
                initialButtonState = !button.classList.contains("selected");

                // Toggle the first button
                const buttons = document.elementsFromPoint(e.clientX, e.clientY);
                const targetButton = buttons.find((el) =>
                    el.classList.contains("grid-btn")
                );
                if (targetButton && targetButton.classList.contains("selected")) {
                    const rect = targetButton.getBoundingClientRect();
                    if (
                        e.clientX >= rect.right - rect.width / 5 ||
                        e.clientX <= rect.left + rect.width / 5
                    ) {
                        isResizing = true;
                        selectionStarted = true;
                        initialButtonState = true;
                    } else {
                        toggleButton(button, initialButtonState);
                    }
                } else {
                    toggleButton(button, initialButtonState);
                }
            });

            // Add mouseup event listener
            button.addEventListener("mouseup", (e) => {
                e.preventDefault();
                e.stopPropagation();
                isDragging = false;
                isResizing = false;
                selectionStarted = false;
            });

            gridContainer.appendChild(button);

            //Give note to first button
            if (i % columns == 1) {
                const noteLabel = document.createElement("div");
                noteLabel.style.marginRight = "5px";
                noteLabel.style.display = "inline-block";
                noteLabel.style.verticalAlign = "center";
                noteLabel.textContent = buttonNote[indexRow];  // Use direct index for note label
            }
            if (i > 7 * columns) button.style.marginBottom = "30px";
        } else {
            // Wrap circle button in a flexbox container to prevent stretching
            button.classList.add("circle");
            const wrapper = document.createElement("div");
            wrapper.style.display = "flex";
            wrapper.style.justifyContent = "center";
            wrapper.style.alignItems = "center";
            wrapper.style.height = "100%";
            wrapper.style.width = "100%";
            wrapper.appendChild(button);
            gridContainer.appendChild(wrapper);
        }
    }
}

// Italian tempo terms mapping
const tempoTerms = [
  { min: 20, max: 40, term: "Grave" },
  { min: 41, max: 60, term: "Largo" },
  { min: 61, max: 76, term: "Adagio" },
  { min: 77, max: 108, term: "Andante" },
  { min: 109, max: 120, term: "Moderato" },
  { min: 121, max: 168, term: "Allegro" },
  { min: 169, max: 200, term: "Presto" },
  { min: 201, max: 300, term: "Prestissimo" },
];

function getTempoTerm(bpm) {
  for (const t of tempoTerms) {
    if (bpm >= t.min && bpm <= t.max) return t.term;
  }
  return "Allegro";
}

// Time signature handling
const timeSignatureSelect = document.getElementById("time-signature");
if (timeSignatureSelect) {
    timeSignatureSelect.addEventListener("change", (e) => {
        currentTimeSignature = e.target.value;
        // Update beats in SongOptions
        if (currentTimeSignature === "4/4") {
            songOptions.beats = 4;
            numColumns = 32;
        } else if (currentTimeSignature === "3/4") {
            songOptions.beats = 3;
            numColumns = 24;
        }
        // Reinitialize grid with new column count
        initializeGrid();
        updateBarDividers();
        drawVex();
    });
}

// Tempo Italian label handling
const tempoItalianLabel = document.getElementById("tempo-italian");
const tempoSlider = document.getElementById("tempo-slider");
const bpmValue = document.getElementById("bpm-value");

function updateTempoItalianLabel() {
  const bpm = songOptions.tempo;
  tempoItalianLabel.textContent = getTempoTerm(bpm);
  if (bpmValue) bpmValue.textContent = bpm;
  if (tempoSlider) tempoSlider.value = bpm;
}

if (tempoSlider) {
  tempoSlider.addEventListener("input", (e) => {
    const bpm = parseInt(e.target.value);
    songOptions.tempo = bpm;
    updateTempoItalianLabel();
  });
}

// Attach event listeners to all possible BPM inputs (for legacy support)
const tempoInputs = document.querySelectorAll(
  'input[type="range"], input[type="number"], input[name="tempo"], #tempo'
);
tempoInputs.forEach((input) => {
  input.addEventListener("input", (e) => {
    const bpm = parseInt(e.target.value);
    songOptions.tempo = bpm;
    updateTempoItalianLabel();
  });
});
updateTempoItalianLabel();

// Dynamic markings handling
const dynamicMarkingsSelect = document.getElementById("dynamic-markings");
const dynamicMarkingDisplay = document.getElementById(
  "dynamic-marking-display"
);
let currentDynamicMarking = "";
dynamicMarkingsSelect.addEventListener("change", (e) => {
  currentDynamicMarking = e.target.value;
  dynamicMarkingDisplay.textContent = currentDynamicMarking;
  // Only update the display, do not break or block any other functionality
  drawVex();
});

drawVex();

const playButton = document.getElementById("play-button");

// Set up event listener
playButton.addEventListener("click", togglePlayback);

// Add styles for play button transitions
const playButtonStyles = document.createElement("style");
playButtonStyles.textContent = `
  .circular-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .circular-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(0, 163, 255, 0.5);
    background: #1aabff !important;
  }

  .circular-btn:active {
    transform: scale(0.95);
  }

  .circular-btn::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: all 0.3s ease;
  }

  .circular-btn:hover::before {
    width: 150%;
    height: 150%;
    opacity: 0.3;
  }

  .play-icon, .pause-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    transition: all 0.3s ease;
  }

  .play-icon {
    transform: translate(-45%, -50%);
  }

  .playing .play-icon {
    opacity: 0;
    transform: translate(-45%, -50%) scale(0);
  }

  .pause-icon {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0);
  }

  .playing .pause-icon {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  @keyframes buttonPulse {
    0% { box-shadow: 0 0 0 0 rgba(0, 163, 255, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(0, 163, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 163, 255, 0); }
  }

  .playing {
    animation: buttonPulse 2s infinite;
  }
`;
document.head.appendChild(playButtonStyles);

/**
 * Toggles music playback state
 */
function togglePlayback() {
  const playButton = document.getElementById("play-button");
  const playIcon = playButton.querySelector(".play-icon");
  const pauseIcon = playButton.querySelector(".pause-icon");

  if (isPlaying) {
    // Switch to play icon
    playButton.classList.remove("playing");
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    stopPlayback();
  } else {
    // Switch to pause icon
    playButton.classList.add("playing");
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
    startPlayback();
  }
}

function stopPlayback() {
  const playButton = document.getElementById("play-button");
  const playIcon = playButton.querySelector(".play-icon");
  const pauseIcon = playButton.querySelector(".pause-icon");

  stopRequested = true;
  isPlaying = false;
  playButton.classList.remove("playing");

  // Animate icon transition
  pauseIcon.style.opacity = "0";
  pauseIcon.style.transform = "translate(-50%, -50%) scale(0)";
  setTimeout(() => {
    pauseIcon.style.display = "none";
    playIcon.style.display = "block";
    setTimeout(() => {
      playIcon.style.opacity = "1";
      playIcon.style.transform = "translate(-45%, -50%) scale(1)";
    }, 50);
  }, 300);

  const progressBar = document.getElementById("playback-progress");
  if (progressBar) {
    progressBar.style.transition = "all 0.3s ease-out";
    progressBar.style.opacity = "0";
    setTimeout(() => {
      progressBar.style.width = "0%";
      progressBar.style.opacity = "1";
    }, 300);
  }

  // Remove any remaining column highlights
  const allButtons = document.querySelectorAll(".grid-btn");
  allButtons.forEach((btn) => {
    btn.classList.remove("playing-column");
    btn.classList.remove("next-column");
  });

  if (currentPlaybackTimeout) {
    clearTimeout(currentPlaybackTimeout);
    currentPlaybackTimeout = null;
  }
}

/**
 * Starts music playback
 */
function startPlayback() {
  const playButton = document.getElementById("play-button");
  const playIcon = playButton.querySelector(".play-icon");
  const pauseIcon = playButton.querySelector(".pause-icon");

  // Animate icon transition
  playIcon.style.opacity = "0";
  playIcon.style.transform = "translate(-45%, -50%) scale(0)";
  setTimeout(() => {
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
    setTimeout(() => {
      pauseIcon.style.opacity = "1";
      pauseIcon.style.transform = "translate(-50%, -50%) scale(1)";
    }, 50);
  }, 300);

  isPlaying = true;
  stopRequested = false;

  // Start playing from the beginning
  playMusic(0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Enhanced visual effects styles
const enhancedStyles = document.createElement("style");
enhancedStyles.textContent = `
  .grid-btn {
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .grid-btn::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    z-index: 1;
  }

  .playing-column {
    position: relative;
    transform: scale(1.05);
  }

  .playing-column::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120%;
    height: 120%;
    background: radial-gradient(circle, rgba(0,116,217,0.3) 0%, rgba(0,116,217,0) 70%);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    animation: rippleEffect 1s ease-out infinite;
  }

  .playing-column::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.2);
    box-shadow: 
      0 0 15px rgba(0, 123, 255, 0.6),
      inset 0 0 15px rgba(255, 255, 255, 0.4);
    animation: glowPulse 0.6s ease-in-out infinite;
    pointer-events: none;
    z-index: 1;
    border-radius: 4px;
    backdrop-filter: blur(2px);
  }

  .playing-column.selected {
    transform: scale(1.1);
    box-shadow: 0 0 20px rgba(0, 123, 255, 0.8);
  }

  .next-column {
    position: relative;
    transform: scale(1.02);
  }

  .next-column::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%);
    transform: translate(-50%, -50%);
    border-radius: 4px;
    animation: previewPulse 1s ease-in-out infinite;
  }

  @keyframes rippleEffect {
    0% {
      width: 0;
      height: 0;
      opacity: 0.5;
    }
    100% {
      width: 200%;
      height: 200%;
      opacity: 0;
    }
  }

  @keyframes glowPulse {
    0% { 
      opacity: 0.8;
      box-shadow: 
        0 0 15px rgba(0, 123, 255, 0.6),
        inset 0 0 15px rgba(255, 255, 255, 0.4);
    }
    50% { 
      opacity: 0.4;
      box-shadow: 
        0 0 25px rgba(0, 123, 255, 0.8),
        inset 0 0 25px rgba(255, 255, 255, 0.6);
    }
    100% { 
      opacity: 0.8;
      box-shadow: 
        0 0 15px rgba(0, 123, 255, 0.6),
        inset 0 0 15px rgba(255, 255, 255, 0.4);
    }
  }

  @keyframes previewPulse {
    0% { opacity: 0.3; }
    50% { opacity: 0.1; }
    100% { opacity: 0.3; }
  }

  .selected {
    animation: selectedPulse 2s ease-in-out infinite;
  }

  @keyframes selectedPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
`;
document.head.appendChild(enhancedStyles);

// Update the playMusic function with enhanced visual effects
async function playMusic(startIndex = 0) {
  if (stopRequested) {
    stopRequested = false;
    return;
  }

  // Reset progress bar at start
  const progressBar = document.getElementById("playback-progress");
  if (startIndex === 0) {
    progressBar.style.width = "0%";
  }

  // Remove highlight from all columns
  const allButtons = document.querySelectorAll(".grid-btn");
  allButtons.forEach((btn) => {
    btn.classList.remove("playing-column");
    btn.classList.remove("next-column");
    btn.style.transform = btn.classList.contains("selected")
      ? "scale(1.05)"
      : "scale(1)";
  });

  for (let i = startIndex; i < numColumns; i++) {
    if (stopRequested) {
      stopRequested = false;
      progressBar.style.width = "0%";
      return;
    }

    // Update progress bar with smoother animation
    const progress = (i / numColumns) * 100;
    progressBar.style.width = `${progress}%`;

    // Get current and next column buttons
    const currentColumnButtons = Array.from(allButtons).filter((btn) => {
      const btnIndex = parseInt(btn.getAttribute("data-id"));
      return (btnIndex - 1) % numColumns === i;
    });

    const nextColumnButtons = Array.from(allButtons).filter((btn) => {
      const btnIndex = parseInt(btn.getAttribute("data-id"));
      return (btnIndex - 1) % numColumns === (i + 1) % numColumns;
    });

    // Remove previous highlights with smooth transition
    allButtons.forEach((btn) => {
      btn.classList.remove("playing-column");
      btn.classList.remove("next-column");
      btn.style.transition = "all 0.3s ease";
    });

    // Add new highlights with enhanced effects
    currentColumnButtons.forEach((btn) => {
      btn.classList.add("playing-column");
      if (btn.classList.contains("selected")) {
        btn.classList.add("playing-column-selected");
      }
    });

    nextColumnButtons.forEach((btn) => {
      btn.classList.add("next-column");
    });

    // Play notes with visual feedback
    if (noteGroup[i].length > 0) {
      noteGroup[i].forEach((note) => {
        const noteButton = currentColumnButtons[7 - note.row];
        if (noteButton) {
          // Add ripple effect when note plays
          const ripple = document.createElement("div");
          ripple.className = "ripple";
          noteButton.appendChild(ripple);
          setTimeout(() => ripple.remove(), 1000);
        }
        sound.instrumentTrack.playNote(
          noteIndex[note.row],
          undefined,
          undefined,
          0.8
        );
      });
    }

    // Use the note duration to determine the delay
    let delayMs = 30000 / songOptions.tempo;
    if (noteGroup[i].length > 0) {
      const duration = noteGroup[i][0].duration;
      switch (duration) {
        case 'q': delayMs *= 2; break; // 1/4 note
        case 'h': delayMs *= 4; break; // 1/2 note
        case 'w': delayMs *= 8; break; // whole note
        default: break; // 1/8 note
      }
    }
    await delay(delayMs);
  }

  if (!stopRequested && isPlaying) {
    // Smooth transition when looping
    const lastColumnButtons = Array.from(allButtons).filter((btn) => {
      const btnIndex = parseInt(btn.getAttribute("data-id"));
      return (btnIndex - 1) % numColumns === numColumns - 1;
    });

    lastColumnButtons.forEach((btn) => {
      btn.classList.remove("playing-column");
      btn.style.transition = "all 0.3s ease";
    });

    await delay(50);
    playMusic(0);
  } else {
    progressBar.style.width = "0%";
    allButtons.forEach((btn) => {
      btn.classList.remove("playing-column");
      btn.classList.remove("next-column");
      btn.style.transform = btn.classList.contains("selected")
        ? "scale(1.05)"
        : "scale(1)";
    });
  }
}

function drawVex() {
    // Initialize VexFlow
    const div = document.getElementById("notation");
    div.innerHTML = "";

    const VF = Vex.Flow;
    const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);

    // Get the grid width dynamically
    const gridContainer = document.getElementById("noteGroup");
    const gridWidth = gridContainer.offsetWidth || 1280;
    const beatsPerMeasure = currentTimeSignature === "3/4" ? 3 : 4;
    const totalMeasures = 4;
    const eighthsPerMeasure = beatsPerMeasure * 2;
    const totalColumns = currentTimeSignature === "3/4" ? 24 : 32;

    // Width calculations
    const clefAndTimeWidth = 60;
    let baseMeasureWidth = (gridWidth - clefAndTimeWidth - 20) / totalMeasures;
    const measureWidth = baseMeasureWidth * 1.03;
    const totalNotationWidth = measureWidth * totalMeasures + clefAndTimeWidth + 20;

    renderer.resize(totalNotationWidth, 150);
    const context = renderer.getContext();

    // Draw clef and time signature
    let initialStave = new VF.Stave(10, 20, clefAndTimeWidth);
    initialStave.addClef("treble").addTimeSignature(currentTimeSignature);
    initialStave.setContext(context).draw();

    // Process notes measure by measure
    let x = clefAndTimeWidth + 10;
    for (let m = 0; m < totalMeasures; m++) {
        // Create stave for this measure
        let stave = new VF.Stave(x, 20, measureWidth);
        if (m === 0) {
            stave.setBegBarType(VF.Barline.type.NONE);
        }
        stave.setContext(context).draw();

        // Get notes for this measure
        let measureNotes = [];
        const startCol = m * eighthsPerMeasure;
        const endCol = Math.min(startCol + eighthsPerMeasure, totalColumns);
        
        // Check if measure is empty
        let isMeasureEmpty = true;
        for (let i = startCol; i < endCol; i++) {
            if (noteGroup[i] && noteGroup[i].length > 0) {
                isMeasureEmpty = false;
                break;
            }
        }

        if (isMeasureEmpty) {
            // Add appropriate rest based on time signature
            const restDuration = currentTimeSignature === "3/4" ? "hr" : "wr";  // half rest for 3/4, whole rest for 4/4
            measureNotes.push(
                new VF.StaveNote({
                    clef: "treble",
                    keys: ["b/4"],
                    duration: restDuration
                })
            );
        } else {
            // Process notes in non-empty measure
        for (let i = startCol; i < endCol; ) {
            if (noteGroup[i] && noteGroup[i].length > 0) {
                const note = noteGroup[i][0];
                // Map the button row to the correct note in the staff
                const staffNoteIndex = 7 - note.row;  // Invert the row index for staff notation
                const keys = [notePair[staffNoteIndex]];
                let duration = note.duration || "8";
                let span = DURATION_TO_SPAN[duration];
                // Prevent note from crossing measure boundary
                if (i + span > endCol) {
                    // If it would cross, reduce duration to fit
                    if (endCol - i >= 4) {
                        duration = 'h'; span = 4;
                    } else if (endCol - i >= 2) {
                        duration = 'q'; span = 2;
                    } else {
                        duration = '8'; span = 1;
                    }
                }
                let staveNote = new VF.StaveNote({
                    clef: "treble",
                    keys: keys,
                    duration: duration
                });
                measureNotes.push(staveNote);
                i += span;
            } else {
                    // Add eighth rest for empty columns in non-empty measures
                measureNotes.push(
                    new VF.StaveNote({
                        clef: "treble",
                        keys: ["b/4"],
                        duration: "8r"
                    })
                );
                i++;
                }
            }
        }

        // Create and draw voice
        let voice = new VF.Voice({
            num_beats: beatsPerMeasure,
            beat_value: 4
        }).setStrict(false);
        voice.addTickables(measureNotes);
        new VF.Formatter()
            .joinVoices([voice])
            .format([voice], measureWidth - 20);
        voice.draw(context, stave);

        // Draw dynamic marking for first measure
        if (currentDynamicMarking && m === 0) {
            context.save();
            context.setFont("Serif", 18, "bold");
            context.setFillStyle("#222");
            context.fillText(
                currentDynamicMarking,
                initialStave.getX() + 10,
                initialStave.getBottomY() + 25
            );
            context.restore();
        }
        x += measureWidth;
    }
}

function updateBarDividers() {
    const buttons = document.querySelectorAll('.grid-btn');
    const eighthsPerMeasure = currentTimeSignature === "3/4" ? 6 : 8;

    buttons.forEach(button => {
        button.classList.remove('bar-divider');
        const indexColumn = (parseInt(button.getAttribute('data-id')) - 1) % numColumns;
        
        // Add bar dividers based on time signature
        if (indexColumn % eighthsPerMeasure === 0 && indexColumn !== 0 && indexColumn <= 8 * numColumns) {
            button.classList.add('bar-divider');
        }
        
        // Add last-bar-divider to the last column
        if (indexColumn === numColumns - 1 && indexColumn <= 8 * numColumns) {
            button.classList.add('last-bar-divider');
        }
    });
}

// Update reset button styles
const resetStyles = document.createElement("style");
resetStyles.textContent = `
  .circular-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .circular-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(0, 163, 255, 0.5);
    background: #1aabff !important;
  }

  .circular-btn:active {
    transform: scale(0.95);
  }

  .circular-btn::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: all 0.3s ease;
  }

  .circular-btn:hover::before {
    width: 150%;
    height: 150%;
    opacity: 0.3;
  }

  .circular-btn svg {
    transition: transform 0.5s ease;
  }

  .circular-btn:hover svg {
    transform: rotate(-180deg);
  }

  .circular-btn.resetting svg {
    animation: spinReset 0.8s ease-in-out;
  }

  @keyframes spinReset {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(-360deg); }
  }

  .circular-btn::after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: 50%;
    background: linear-gradient(45deg, #00A3FF, #66c7ff);
    z-index: -1;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .circular-btn:hover::after {
    opacity: 0.5;
  }
`;
document.head.appendChild(resetStyles);

// Add history stacks for undo/redo
const historyStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

function saveState() {
  const state = {
    notes: JSON.parse(JSON.stringify(noteGroup)),
    tempo: songOptions.tempo,
    timeSignature: currentTimeSignature,
    dynamics: currentDynamicMarking,
  };
  historyStack.push(state);
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  }
  redoStack.length = 0;
}

function undo() {
  if (historyStack.length > 0) {
    const currentState = {
      notes: JSON.parse(JSON.stringify(noteGroup)),
      tempo: songOptions.tempo,
      timeSignature: currentTimeSignature,
      dynamics: currentDynamicMarking,
    };
    redoStack.push(currentState);

    const previousState = historyStack.pop();
    restoreState(previousState);
  }
}

function redo() {
  if (redoStack.length > 0) {
    const currentState = {
      notes: JSON.parse(JSON.stringify(noteGroup)),
      tempo: songOptions.tempo,
      timeSignature: currentTimeSignature,
      dynamics: currentDynamicMarking,
    };
    historyStack.push(currentState);

    const nextState = redoStack.pop();
    restoreState(nextState);
  }
}

function restoreState(state) {
  noteGroup = JSON.parse(JSON.stringify(state.notes));
  songOptions.tempo = state.tempo;
  currentTimeSignature = state.timeSignature;
  currentDynamicMarking = state.dynamics;

  // Update UI
  updateUI();
  drawVex();
}

function updateUI() {
  // Update tempo slider
  if (tempoSlider) {
    tempoSlider.value = songOptions.tempo;
    updateTempoItalianLabel();
  }

  // Update time signature
  if (timeSignatureSelect) {
    timeSignatureSelect.value = currentTimeSignature;
    songOptions.beats = currentTimeSignature === "4/4" ? 4 : 3;
  }

  // Update dynamics
  if (dynamicMarkingsSelect) {
    dynamicMarkingsSelect.value = currentDynamicMarking;
    if (dynamicMarkingDisplay) {
      dynamicMarkingDisplay.textContent = currentDynamicMarking;
    }
  }

  // Update grid buttons
  const allButtons = document.querySelectorAll(".grid-btn");
  allButtons.forEach((btn) => {
    const buttonColumn =
      (parseInt(btn.getAttribute("data-id")) - 1) % numColumns;
    const buttonRow =
      7 - Math.floor(parseInt(btn.getAttribute("data-id")) / numColumns);

    const isSelected = noteGroup[buttonColumn].some(n => n.row === buttonRow);
    btn.classList.toggle("selected", isSelected);
    if (isSelected) {
      btn.style.backgroundColor = noteColor[buttonRow];
    } else {
      btn.style.backgroundColor = "";
    }
  });
}

// Add drag styles
const dragStyles = document.createElement("style");
dragStyles.textContent = `
  .grid-btn {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

  .grid-btn.drag-hover {
    transform: scale(1.1);
    transition: transform 0.1s ease;
  }
`;
document.head.appendChild(dragStyles);

// Restore resetGrid function
function resetGrid(
  options = {
    notes: true,
    tempo: true,
    timeSignature: true,
    dynamics: true,
  }
) {
  // Save current state before reset
  saveState();

  const resetButton = document.getElementById("reset-button");

  // Add confirmation dialog if there are notes and we're resetting notes
  if (options.notes) {
    const hasNotes = noteGroup.some((column) => column.length > 0);
    if (hasNotes) {
      // Create a custom confirmation dialog
      const dialog = document.createElement("div");
      dialog.className = "reset-confirm";
      dialog.innerHTML = `
        <h3>Reset Confirmation</h3>
        <p>This will clear all notes from the grid. This action cannot be undone. Do you want to continue?</p>
        <div class="reset-confirm-buttons">
          <button class="reset-confirm-button reset-confirm-cancel">Cancel</button>
          <button class="reset-confirm-button reset-confirm-ok">Reset</button>
        </div>
      `;

      document.body.appendChild(dialog);

      // Handle dialog buttons
      return new Promise((resolve) => {
        dialog.querySelector(".reset-confirm-cancel").onclick = () => {
          document.body.removeChild(dialog);
          resolve(false);
        };

        dialog.querySelector(".reset-confirm-ok").onclick = () => {
          document.body.removeChild(dialog);
          resolve(true);
        };
      }).then((confirmed) => {
        if (!confirmed) return;
        performReset(options);
      });
    }
  }

  performReset(options);
}

function performReset(options) {
  const resetButton = document.getElementById("reset-button");

  // Add spinning animation class
  resetButton.classList.add("resetting");

  // Create reset wave animation
  const wave = document.createElement("div");
  wave.className = "reset-wave";
  resetButton.appendChild(wave);
  setTimeout(() => resetButton.removeChild(wave), 800);

  // If playing, stop playback first
  if (isPlaying) {
    stopPlayback();
  }

  // Reset progress bar with fade
  if (options.notes) {
    const progressBar = document.getElementById("playback-progress");
    if (progressBar) {
      progressBar.style.transition = "all 0.3s ease-out";
      progressBar.style.opacity = "0";
      setTimeout(() => {
        progressBar.style.width = "0%";
        progressBar.style.opacity = "1";
      }, 300);
    }
  }

  // Reset based on options
  if (options.notes) {
    // Add ripple effect to the entire grid
    const gridContainer = document.getElementById("noteGroup");
    gridContainer.style.position = "relative";
    const ripple = document.createElement("div");
    ripple.className = "grid-ripple";
    gridContainer.appendChild(ripple);

    // Reset all buttons with ripple animation
    const allButtons = document.querySelectorAll(".grid-btn");
    allButtons.forEach((btn, index) => {
      // remove connected buttons
      btn.classList.remove("connect");

      if (btn.classList.contains("selected")) {
        // Add fade out effect with delay based on column
        const buttonColumn =
          (parseInt(btn.getAttribute("data-id")) - 1) % numColumns;
        const delay = buttonColumn * 20; // 20ms delay per column

        setTimeout(() => {
          btn.style.transition = "all 0.3s ease-out";
          btn.style.opacity = "0.5";
          btn.style.transform = "scale(0.9)";

          setTimeout(() => {
            btn.classList.remove("selected");
            btn.style.backgroundColor = "";
            btn.style.opacity = "1";
            btn.style.transform = "scale(1)";

            const buttonRow =
              7 -
              Math.floor(parseInt(btn.getAttribute("data-id")) / numColumns);
            const columnNotes = noteGroup[buttonColumn];
            const noteIndex = columnNotes.findIndex(n => n.row === buttonRow);
            if (noteIndex > -1) {
              columnNotes.splice(noteIndex, 1);
            }
          }, 300);
        }, delay);
      }
    });

    // Remove ripple effect after animation
    setTimeout(() => {
      gridContainer.removeChild(ripple);
    }, numColumns * 20 + 600);

    // Clear all notes from noteGroup
    for (let i = 0; i < noteGroup.length; i++) {
      noteGroup[i] = [];
    }
  }

  if (options.tempo) {
    // Reset tempo to default with smooth transition
    if (tempoSlider) {
      tempoSlider.style.transition = "all 0.3s ease";
      tempoSlider.value = 120;
      songOptions.tempo = 120;
      updateTempoItalianLabel();
    }
  }

  if (options.timeSignature) {
    // Reset time signature to 4/4
    if (timeSignatureSelect) {
      timeSignatureSelect.value = "4/4";
      currentTimeSignature = "4/4";
      songOptions.beats = 4;
    }
  }

  if (options.dynamics) {
    // Reset dynamic markings with fade
    if (dynamicMarkingsSelect) {
      dynamicMarkingsSelect.value = "";
      currentDynamicMarking = "";
      if (dynamicMarkingDisplay) {
        dynamicMarkingDisplay.style.transition = "opacity 0.3s ease";
        dynamicMarkingDisplay.style.opacity = "0";
        setTimeout(() => {
          dynamicMarkingDisplay.textContent = "";
          dynamicMarkingDisplay.style.opacity = "1";
        }, 300);
      }
    }
  }

  // Update the music notation
  drawVex();

  // Show success message
  const successMessage = document.createElement("div");
  successMessage.className = "reset-success";
  successMessage.textContent = "Reset complete!";
  document.body.appendChild(successMessage);

  setTimeout(() => {
    successMessage.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(successMessage);
    }, 300);
  }, 2000);

  // Remove spinning animation class after completion
  setTimeout(() => {
    resetButton.classList.remove("resetting");
  }, 800);
}

// Add context menu for reset options
function addResetContextMenu() {
  const resetButton = document.getElementById("reset-button");

  resetButton.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const menu = document.createElement("div");
    menu.className = "reset-context-menu";
    menu.innerHTML = `
      <div class="menu-item" data-action="all">Reset All</div>
      <div class="menu-item" data-action="notes">Reset Notes Only</div>
      <div class="menu-item" data-action="tempo">Reset Tempo Only</div>
      <div class="menu-item" data-action="time-signature">Reset Time Signature Only</div>
      <div class="menu-item" data-action="dynamics">Reset Dynamics Only</div>
    `;

    // Position menu
    menu.style.position = "absolute";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    // Handle menu item clicks
    menu.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      switch (action) {
        case "all":
          resetGrid({
            notes: true,
            tempo: true,
            timeSignature: true,
            dynamics: true,
          });
          break;
        case "notes":
          resetGrid({
            notes: true,
            tempo: false,
            timeSignature: false,
            dynamics: false,
          });
          break;
        case "tempo":
          resetGrid({
            notes: false,
            tempo: true,
            timeSignature: false,
            dynamics: false,
          });
          break;
        case "time-signature":
          resetGrid({
            notes: false,
            tempo: false,
            timeSignature: true,
            dynamics: false,
          });
          break;
        case "dynamics":
          resetGrid({
            notes: false,
            tempo: false,
            timeSignature: false,
            dynamics: true,
          });
          break;
      }
      document.body.removeChild(menu);
    });

    document.body.appendChild(menu);

    // Remove menu when clicking outside
    document.addEventListener("click", function removeMenu(e) {
      if (!menu.contains(e.target)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener("click", removeMenu);
      }
    });
  });
}

// Add keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Reset (Ctrl/Cmd + R)
  if ((e.ctrlKey || e.metaKey) && e.key === "r") {
    e.preventDefault();
    resetGrid();
  }

  // Undo (Ctrl/Cmd + Z)
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
  }

  // Redo (Ctrl/Cmd + Shift + Z) or (Ctrl/Cmd + Y)
  if (
    (e.ctrlKey || e.metaKey) &&
    ((e.shiftKey && e.key === "z") || e.key === "y")
  ) {
    e.preventDefault();
    redo();
  }
});

// Initialize reset functionality
document.addEventListener("DOMContentLoaded", () => {
  const resetButton = document.getElementById("reset-button");
  if (resetButton) {
    resetButton.addEventListener("click", () => resetGrid());
    addResetContextMenu();
  }
});

// Update the mousemove event handler
document.addEventListener("mousemove", (e) => {
    if (!isDragging || !selectionStarted) return;

    const buttons = document.elementsFromPoint(e.clientX, e.clientY);
    const targetButton = buttons.find((el) => 
        el.classList.contains("grid-btn") && 
        el.getAttribute("data-id") <= 8 * numColumns
    );

    if (targetButton && targetButton !== lastSelectedButton) {
        if (!isResizing) {
            lastSelectedButton = targetButton;
            toggleButton(targetButton, initialButtonState);
        } else if (
            lastSelectedNote == 0 ||
            lastSelectedNote == Math.floor(targetButton.getAttribute("data-id") / numColumns)
        ) {
            lastSelectedButton = targetButton;
            lastSelectedNote = Math.floor(targetButton.getAttribute("data-id") / numColumns);
            toggleButton(targetButton, initialButtonState);
            targetButton.classList.add("connect");
            targetButton.style.boxShadow = "none";
        } else {
            initVariables();
        }
    }
});

// Update the mouseup event handler
document.addEventListener("mouseup", (e) => {
    if (isDragging || isResizing) {
        initVariables();
        drawVex();
    }
});

// change cursor on button boundry
document.addEventListener("mousemove", (e) => {
  const buttons = document.elementsFromPoint(e.clientX, e.clientY);
  const targetButton = buttons.find((el) => el.classList.contains("grid-btn"));

  if (targetButton) {
    const rect = targetButton.getBoundingClientRect();
    if (
      e.clientX >= rect.right - rect.width / 5 ||
      e.clientX <= rect.left + rect.width / 5
    ) {
      if (targetButton.classList.contains("selected")) {
        document.body.style.cursor = "ew-resize";
      }
    } else {
      document.body.style.cursor = "pointer";
    }
  }
});

document.addEventListener("mouseup", () => {
  initVariables();
  // Redraw the music notation
  drawVex();
});

// initialize variables
function initVariables() {
  isDragging = false;
  isResizing = false;
  selectionStarted = false;
  lastSelectedButton = null;
  lastSelectedNote = 0;
}

// Helper to get measure info for a column
function getMeasureInfo(column) {
  const beatsPerMeasure = currentTimeSignature === "3/4" ? 3 : 4;
  const eighthsPerMeasure = beatsPerMeasure * 2;
  const measureIndex = Math.floor(column / eighthsPerMeasure);
  const measureStart = measureIndex * eighthsPerMeasure;
  const measureEnd = measureStart + eighthsPerMeasure;
  return { measureIndex, measureStart, measureEnd, beatsPerMeasure, eighthsPerMeasure };
}

// Helper to get total duration in a measure (in eighths)
function getMeasureFilled(column) {
  const { measureStart, measureEnd } = getMeasureInfo(column);
  let filled = 0;
  for (let i = measureStart; i < measureEnd; ) {
    if (noteGroup[i] && noteGroup[i].length > 0) {
      const note = noteGroup[i][0];
      const span = DURATION_TO_SPAN[note.duration || '8'];
      filled += span;
      i += span;
    } else {
      i++;
    }
  }
  return filled;
}

// Show a warning message near a button
function showWarning(button, message) {
  // Remove any existing warning
  const oldWarn = document.getElementById('measure-warning');
  if (oldWarn) oldWarn.remove();
  const warn = document.createElement('div');
  warn.id = 'measure-warning';
  warn.textContent = message;
  warn.style.position = 'absolute';
  warn.style.left = button.getBoundingClientRect().left + 'px';
  warn.style.top = (button.getBoundingClientRect().top - 30) + 'px';
  warn.style.background = '#fffbe6';
  warn.style.border = '1px solid #e6b800';
  warn.style.color = '#b36b00';
  warn.style.padding = '4px 10px';
  warn.style.borderRadius = '4px';
  warn.style.zIndex = 10001;
  warn.style.fontSize = '14px';
  warn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
  document.body.appendChild(warn);
  setTimeout(() => { if (warn.parentNode) warn.remove(); }, 2000);
}

// Modified toggleButton to support measure warning
function toggleButton(button, forceState = null) {
    const index = parseInt(button.getAttribute("data-id"));
    let buttonRow = Math.floor((index - 1) / numColumns);  // Direct row calculation (0 = top)
    let buttonColumn = (index - 1) % numColumns;

    // Show duration menu if adding a note
    if (forceState !== false && (!button.classList.contains("selected") || forceState === true)) {
        // Before showing duration menu, check if measure is full
        const { measureStart, measureEnd, eighthsPerMeasure } = getMeasureInfo(buttonColumn);
        const filled = getMeasureFilled(buttonColumn);
        if (filled >= eighthsPerMeasure) {
            showWarning(button, "This measure is full!");
            return;
        }
        // If not full, show duration menu
        showDurationMenu(button, buttonRow, buttonColumn);
        return;
    }

    // Remove note if already selected
    if (button.classList.contains("selected")) {
        button.classList.remove("selected");
        button.classList.remove("connect");
        button.style.backgroundColor = "";
        // Only remove the specific note from this column
        noteGroup[buttonColumn] = noteGroup[buttonColumn].filter(n => n.row !== buttonRow);
        drawVex(); // Update the notation after removing the note
    }
}

// Update the showDurationMenu function to include chord options
function showDurationMenu(button, buttonRow, buttonColumn) {
    // Remove any existing menu
    const oldMenu = document.getElementById('duration-menu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'duration-menu';
    menu.style.position = 'absolute';
    menu.style.left = button.getBoundingClientRect().left + 'px';
    menu.style.top = button.getBoundingClientRect().top + 'px';
    menu.style.background = '#fff';
    menu.style.border = '1px solid #ccc';
    menu.style.zIndex = 10000;
    menu.style.padding = '4px 8px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';

    Object.entries(DURATION_LABELS).forEach(([dur, label]) => {
        const { measureStart, measureEnd, eighthsPerMeasure } = getMeasureInfo(buttonColumn);
        const filled = getMeasureFilled(buttonColumn);
        const span = DURATION_TO_SPAN[dur];
        const colInMeasure = buttonColumn - measureStart;
        
        // Check if note would cross measure boundary
        if (colInMeasure + span > eighthsPerMeasure) {
            const item = document.createElement('div');
            item.textContent = label + ' (crosses measure)';
            item.style.color = '#aaa';
            item.style.cursor = 'not-allowed';
            menu.appendChild(item);
            return;
        }
        
        // Check if measure is full
        if (filled + span > eighthsPerMeasure) {
            const item = document.createElement('div');
            item.textContent = label + ' (measure full)';
            item.style.color = '#aaa';
            item.style.cursor = 'not-allowed';
            menu.appendChild(item);
            return;
        }
        
        // Otherwise, allow selection
        const item = document.createElement('div');
        item.textContent = label;
        item.style.cursor = 'pointer';
        item.style.padding = '2px 0';
        item.onclick = () => {
            if (canPlaceNote(buttonColumn, dur)) {
                // Clear only the affected span
                clearSpan(buttonColumn, dur);
                // Add the new note
                noteGroup[buttonColumn].push({ row: buttonRow, duration: dur, start: true });
                // Update only the affected buttons
                for (let i = 0; i < DURATION_TO_SPAN[dur]; i++) {
                    const btn = document.querySelector(`[data-id="${buttonColumn + 1 + i + buttonRow * numColumns}"]`);
                    if (btn) {
                        btn.classList.add('selected');
                        btn.style.backgroundColor = noteColor[buttonRow];
                        if (i > 0) btn.classList.add('connect');
                    }
                }
                drawVex(); // Update the notation
            }
            menu.remove();
        };
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('mousedown', function handler(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', handler);
            }
        });
    }, 10);
}

// Update or add the style for grid button borders and odd-group background, without !important so JS can override
const oddGroupStyle = document.createElement("style");
oddGroupStyle.textContent = `
  .grid-btn {
    border-top: 0.1px solid #d8efff;
    border-left: 0.1px solid #d8efff;
    background: #fff;
    box-sizing: border-box;
  }
  .grid-btn.odd-group {
    background: #f5f5f5;
  }
  /* Do NOT set background for selected here; let JS handle it per row */
`;
document.head.appendChild(oddGroupStyle);

// Update the style for circle grid buttons to always be a perfect circle using fixed px values
const circleBtnStyle = document.createElement("style");
circleBtnStyle.textContent = `
  .grid-btn.circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: block;
    margin: 0;
  }
`;
document.head.appendChild(circleBtnStyle);
