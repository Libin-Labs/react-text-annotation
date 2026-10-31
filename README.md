# @lp-labs/react-text-annotation

Controlled plain-text annotations for React 18.2 and 19, with overlapping ranges,
editable comments, and versioned serialization. React is the only peer; there are
no runtime dependencies. Content is rendered as text, never injected as HTML.

## Install and use

```sh
npm install @lp-labs/react-text-annotation react
```

```tsx
import { useState } from "react";
import {
  TextAnnotator,
  serializeAnnotations,
  deserializeAnnotations,
  type TextAnnotation,
} from "@lp-labs/react-text-annotation";
import "@lp-labs/react-text-annotation/style.css";

const text = "Select some text to add a comment.";

export function Notes() {
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([
    { id: "first", start: 0, end: 6, comment: "Try a selection." },
  ]);
  return (
    <>
      <TextAnnotator
        text={text}
        annotations={annotations}
        onChange={setAnnotations}
      />
      <button onClick={() => {
        const saved = serializeAnnotations(text, annotations);
        localStorage.setItem("notes", saved);
      }}>Save</button>
      <button onClick={() => {
        const saved = localStorage.getItem("notes");
        if (!saved) return;
        try {
          const restored = deserializeAnnotations(saved);
          if (restored.text === text) setAnnotations(restored.annotations);
        } catch (error) {
          console.error("Invalid saved document", error);
        }
      }}>Load</button>
    </>
  );
}
```

Select text with a mouse, or use keyboard selection inside the focusable text
region, then enter a comment and activate Add annotation. Comments can be empty.
The list exposes Edit comment and Remove comment controls.

## Component and types

`TextAnnotation` is `{ id: string; start: number; end: number; comment: string }`.
Offsets are UTF-16 code units, start-inclusive and end-exclusive, matching
`String.slice` and DOM Range text lengths. IDs must be unique nonempty strings;
offsets must be integers with `0 <= start < end <= text.length`.
Ranges may overlap. Avoid splitting surrogate pairs or grapheme clusters when
constructing ranges manually; grapheme snapping is not performed.

`TextAnnotator(props: TextAnnotationProps)`:

| Prop | Type | Default / behavior |
| --- | --- | --- |
| `text` | `string` | Required; plain text source. |
| `annotations` | `readonly TextAnnotation[]` | Required; always controlled, never mutated. |
| `onChange` | `(annotations: TextAnnotation[]) => void` | Optional; full next array after add/edit/remove. Without it, editing controls are hidden. |
| `onSelectRange` | `(range: { start: number; end: number }) => void` | Optional; valid nonempty selection captured on mouseup/keyup inside the text region. |
| `createId` | `() => string` | Optional; otherwise generates instance-local `annotation-N`, avoiding current IDs. Custom empty/duplicate IDs cause RangeError when saving. |
| `readOnly` | `boolean` | `false`; hides add/edit/remove forms, but selection reporting remains available. |
| `className` | `string` | `""`; appended to `lp-annotations`. |
| `style` | `CSSProperties` | Omitted; section inline styles. |
| `label` | `string` | `"Annotated text"`; accessible section label. |

Invalid annotations cause `RangeError` during rendering or save. Callbacks run
in response to user actions; update the controlled array to show their result.
Errors thrown by caller callbacks propagate to the caller.

## Helpers (all exported)

- `validateAnnotations(text: string, annotations: readonly TextAnnotation[]): void`
  checks the ID, comment, and range rules above; throws `RangeError` on violation.
- `segmentAnnotations(text, annotations): AnnotationSegment[]` validates first,
  splits text at each range boundary, and reports all covering annotation IDs in
  input order. `AnnotationSegment` is `{ start: number; end: number; text: string;
  annotationIds: string[] }`. Unmarked segments have an empty ID array. Empty text
  with no annotations returns `[]`. No input is mutated.
- `serializeAnnotations(text, annotations): string` validates and returns a JSON
  document containing `version: 1`, the exact text, and annotations. JSON is data,
  not HTML: do not embed it in an HTML script without your own escaping.
- `deserializeAnnotations(json: string): { text: string; annotations: TextAnnotation[] }`
  parses and validates a version 1 document, returning only the supported fields.
  Malformed JSON throws `SyntaxError`; a wrong envelope throws `TypeError`;
  invalid ranges/IDs/comments throw `RangeError`. It does not trust or execute HTML.
- `rebaseAnnotations(annotations: readonly TextAnnotation[], edit: { start: number;
  end: number; insertedText: string }): TextAnnotation[]` applies the explicit
  offset update policy below. Invalid edit endpoints (negative, fractional, or
  reversed) throw `RangeError`. It assumes the existing annotations are valid and
  the edit endpoints fit the old text; validate those against your own text.

### Offset update policy

The component does not guess offsets when `text` changes. Supply a rebased
annotation array at the same time. A draft selection tied to an old text value
cannot be saved into a different text value.

For one replacement `[start, end)`, `rebaseAnnotations` keeps annotations ending
at/before the edit start, shifts annotations starting at/after the edit end by
the inserted length minus removed length, and drops intersected annotations.
For insertion, ranges ending at the insertion remain unchanged; ranges starting
there shift right; a range containing the insertion strictly inside is dropped.
This conservative policy avoids silently annotating replacement text. The helper
returns copies and does not change text itself. An empty insertion (no removed or
inserted text) preserves all annotations as copies.

```tsx
import {
  rebaseAnnotations,
  segmentAnnotations,
  validateAnnotations,
  type TextAnnotation,
} from "@lp-labs/react-text-annotation";

const oldText = "Hello world";
const notes: TextAnnotation[] = [
  { id: "world", start: 6, end: 11, comment: "A place" },
];
const edit = { start: 0, end: 0, insertedText: "Say: " };
const nextText = oldText.slice(0, edit.start) + edit.insertedText + oldText.slice(edit.end);
const nextNotes = rebaseAnnotations(notes, edit);
validateAnnotations(nextText, nextNotes);
console.log(segmentAnnotations(nextText, nextNotes));
```

## CSS, accessibility, and limits

Import CSS explicitly; override `--annotation-color`, `.lp-annotations-text`,
`mark`, and form styles. The text region preserves whitespace and is keyboard
focusable. Native buttons, a labeled textarea, and a textual comment list expose
content without relying on highlight color. Highlights themselves are not
clickable and do not open tooltips. Overlapping ranges render one mark per
segment, with JSON-encoded IDs in `data-annotation-ids`.

Selection uses the owning document and only accepts ranges wholly inside the
text region. Touch selection may not emit mouseup/keyup consistently; applications
can create annotations directly from offsets for an alternative touch workflow.
This is not a rich-text editor, collaborative anchor engine, or persistence
service. No global selection listeners or observers are installed. Browser
Selection/Range APIs are needed only for selection capture, not import or SSR.
CSS does not provide print-specific layout or automatic comment linking.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
