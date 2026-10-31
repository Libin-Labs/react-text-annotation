import { useRef, useState, type CSSProperties } from 'react';

export interface TextAnnotation {
  id: string;
  start: number;
  end: number;
  comment: string;
}

export interface AnnotationSegment {
  start: number;
  end: number;
  text: string;
  annotationIds: string[];
}

export function validateAnnotations(text: string, annotations: readonly TextAnnotation[]): void {
  const ids = new Set<string>();
  for (const item of annotations) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      !Number.isInteger(item.start) ||
      !Number.isInteger(item.end) ||
      item.start < 0 ||
      item.end <= item.start ||
      item.end > text.length ||
      typeof item.comment !== 'string'
    ) {
      throw new RangeError(
        'Annotations require unique IDs, string comments, and nonempty UTF-16 ranges within text.',
      );
    }
    ids.add(item.id);
  }
}

export function segmentAnnotations(
  text: string,
  annotations: readonly TextAnnotation[],
): AnnotationSegment[] {
  validateAnnotations(text, annotations);
  const boundaries = [
    ...new Set([0, text.length, ...annotations.flatMap((item) => [item.start, item.end])]),
  ].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    return {
      start,
      end,
      text: text.slice(start, end),
      annotationIds: annotations
        .filter((item) => item.start <= start && item.end >= end)
        .map((item) => item.id),
    };
  });
}

export function serializeAnnotations(text: string, annotations: readonly TextAnnotation[]): string {
  validateAnnotations(text, annotations);
  return JSON.stringify({ version: 1, text, annotations });
}

export function deserializeAnnotations(json: string): {
  text: string;
  annotations: TextAnnotation[];
} {
  const data = JSON.parse(json) as { version?: unknown; text?: unknown; annotations?: unknown };
  if (
    !data ||
    data.version !== 1 ||
    typeof data.text !== 'string' ||
    !Array.isArray(data.annotations)
  ) {
    throw new TypeError('Expected a version 1 annotation document.');
  }
  validateAnnotations(data.text, data.annotations);
  return {
    text: data.text,
    annotations: data.annotations.map(({ id, start, end, comment }: TextAnnotation) => ({
      id,
      start,
      end,
      comment,
    })),
  };
}

/** Rebase one replacement [start,end); overlapping annotations are deliberately dropped. */
export function rebaseAnnotations(
  annotations: readonly TextAnnotation[],
  edit: { start: number; end: number; insertedText: string },
): TextAnnotation[] {
  if (
    !Number.isInteger(edit.start) ||
    !Number.isInteger(edit.end) ||
    edit.start < 0 ||
    edit.end < edit.start ||
    typeof edit.insertedText !== 'string'
  ) {
    throw new RangeError('Invalid text replacement.');
  }
  if (edit.start === edit.end && edit.insertedText.length === 0) {
    return annotations.map((item) => ({ ...item }));
  }
  const delta = edit.insertedText.length - (edit.end - edit.start);
  return annotations.flatMap((item) => {
    if (item.end <= edit.start) return [{ ...item }];
    if (item.start >= edit.end)
      return [{ ...item, start: item.start + delta, end: item.end + delta }];
    return [];
  });
}

export interface TextAnnotationProps {
  text: string;
  annotations: readonly TextAnnotation[];
  onChange?: (annotations: TextAnnotation[]) => void;
  onSelectRange?: (range: { start: number; end: number }) => void;
  createId?: () => string;
  readOnly?: boolean;
  className?: string;
  style?: CSSProperties;
  label?: string;
}

export function TextAnnotator({
  text,
  annotations,
  onChange,
  onSelectRange,
  createId,
  readOnly = false,
  className = '',
  style,
  label = 'Annotated text',
}: TextAnnotationProps) {
  const root = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const [range, setRange] = useState<{ start: number; end: number; text: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const segments = segmentAnnotations(text, annotations);
  const capture = () => {
    const element = root.current;
    const selection = element?.ownerDocument.getSelection();
    if (!element || !selection?.rangeCount || selection.isCollapsed) return;
    const selected = selection.getRangeAt(0);
    if (!element.contains(selected.startContainer) || !element.contains(selected.endContainer))
      return;
    const prefix = selected.cloneRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(selected.startContainer, selected.startOffset);
    const start = prefix.toString().length;
    const end = start + selected.toString().length;
    if (end > start) {
      setRange({ start, end, text });
      setEditing(null);
      setDraft('');
      onSelectRange?.({ start, end });
    }
  };
  const save = () => {
    if (readOnly || !onChange) return;
    if (editing) {
      onChange(
        annotations.map((item) =>
          item.id === editing ? { ...item, comment: draft } : { ...item },
        ),
      );
    } else if (range?.text === text) {
      let id = createId?.();
      if (id === undefined) {
        do {
          id = `annotation-${++counter.current}`;
        } while (annotations.some((item) => item.id === id));
      }
      const next = [...annotations, { id, start: range.start, end: range.end, comment: draft }];
      validateAnnotations(text, next);
      onChange(next);
    } else return;
    setRange(null);
    setEditing(null);
    setDraft('');
  };
  return (
    <section className={`lp-annotations ${className}`} style={style} aria-label={label}>
      <div
        className="lp-annotations-text"
        ref={root}
        tabIndex={0}
        onMouseUp={capture}
        onKeyUp={capture}
      >
        {segments.map((segment) =>
          segment.annotationIds.length ? (
            <mark key={segment.start} data-annotation-ids={JSON.stringify(segment.annotationIds)}>
              {segment.text}
            </mark>
          ) : (
            <span key={segment.start}>{segment.text}</span>
          ),
        )}
      </div>
      <ul aria-label="Comments">
        {annotations.map((item) => (
          <li key={item.id}>
            <q>{text.slice(item.start, item.end)}</q>: {item.comment}
            {!readOnly && onChange && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item.id);
                    setRange(null);
                    setDraft(item.comment);
                  }}
                >
                  Edit comment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(annotations.filter((entry) => entry.id !== item.id));
                    if (editing === item.id) setEditing(null);
                  }}
                >
                  Remove comment
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && onChange && (editing !== null || range?.text === text) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label>
            Comment
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <button type="submit">{editing ? 'Save comment' : 'Add annotation'}</button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setRange(null);
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
