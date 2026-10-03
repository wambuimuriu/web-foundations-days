// Starting data
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// 1. Notes whose text contains the word (ignoring case)
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

// 2. The note with the most characters, or null if there are none
function longestNote() {
  if (notes.length === 0) return null;
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Count notes per category
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}

// 4. A sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const counts = countByCategory();
  const word = notes.length === 1 ? "note" : "notes";
  const parts = CATEGORIES.map((cat) => `${counts[cat] || 0} ${cat}`);
  return `${notes.length} ${word}: ${parts.join(", ")}.`;
}

// Helper: trim, collapse extra spaces, lower-case
function normalise(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// 5. Does a note with the same text already exist?
function isDuplicate(text) {
  const wanted = normalise(text);
  return notes.some((note) => normalise(note.text) === wanted);
}

// 6. Add a note only if it passes every check
function addNote(text, category) {
  const cleaned = text.trim();
  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Rejected: note must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Rejected: that note already exists.");
    return false;
  }
  if (!CATEGORIES.includes(category)) {
    console.log("Rejected: category must be personal, work or study.");
    return false;
  }
  const newId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: newId, text: cleaned, category: category });
  return true;
}

// ---------- Tests ----------

// searchNotes
console.log(searchNotes("report"));
// Expected: array with 1 note (id 3, "Email the project report to Grace")
console.log(searchNotes("REVISE"));
// Expected: array with 1 note (id 4, "Revise JavaScript arrays") - case ignored
console.log(searchNotes("zebra"));
// Expected: [] (no results)

// longestNote
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

// countByCategory
console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }

// getSummary
console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."

// isDuplicate
console.log(isDuplicate("  call   MUM "));
// Expected: true (ignores case and extra spaces)
console.log(isDuplicate("Walk the dog"));
// Expected: false

// addNote
console.log(addNote("Pay school fees", "work"));
// Expected: true
console.log(addNote("call mum", "personal"));
// Expected: logs "Rejected: that note already exists." then false
console.log(addNote("   ", "study"));
// Expected: logs "Rejected: note must be 1-200 characters." then false
console.log(addNote("x".repeat(201), "study"));
// Expected: logs "Rejected: note must be 1-200 characters." then false
console.log(addNote("Go to the gym", "hobby"));
// Expected: logs "Rejected: category must be personal, work or study." then false

// Summary again after the one successful add
console.log(getSummary());
// Expected: "6 notes: 2 personal, 2 work, 2 study."

// Empty-array edge cases
notes = [];
console.log(longestNote());
// Expected: null
console.log(getSummary());
// Expected: "0 notes: 0 personal, 0 work, 0 study."
