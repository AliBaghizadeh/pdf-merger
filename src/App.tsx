import { useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Download, GripVertical, Loader2, Trash2, Upload } from "lucide-react";
import { PDFDocument } from "pdf-lib";

type PdfItem = {
  id: string;
  file: File;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SortablePdfRow({
  item,
  index,
  onRemove,
}: {
  item: PdfItem;
  index: number;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      className={`file-row ${isDragging ? "is-dragging" : ""}`}
      style={style}
    >
      <button
        className="icon-button drag-handle"
        type="button"
        aria-label={`Drag ${item.file.name}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span className="file-order">{index + 1}</span>
      <div className="file-meta">
        <span className="file-name">{item.file.name}</span>
        <span className="file-size">{formatSize(item.file.size)}</span>
      </div>
      <button
        className="icon-button danger"
        type="button"
        aria-label={`Remove ${item.file.name}`}
        title="Remove file"
        onClick={() => onRemove(item.id)}
      >
        <Trash2 size={18} />
      </button>
    </li>
  );
}

export default function App() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [error, setError] = useState("");
  const [isMerging, setIsMerging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function addFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    const pdfs = selected.filter(
      (file) =>
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );

    if (!pdfs.length) {
      setError("Choose at least one PDF file.");
      return;
    }

    if (pdfs.length !== selected.length) {
      setError("Only PDF files were added.");
    } else {
      setError("");
    }

    setItems((current) => [
      ...current,
      ...pdfs.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
      })),
    ]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setItems((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const newIndex = current.findIndex((item) => item.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  async function mergePdfs() {
    if (!items.length) {
      setError("Add PDF files before merging.");
      return;
    }

    setIsMerging(true);
    setError("");

    try {
      const merged = await PDFDocument.create();

      for (const item of items) {
        const sourceBytes = await item.file.arrayBuffer();
        const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
        const copiedPages = await merged.copyPages(source, source.getPageIndices());
        copiedPages.forEach((page) => merged.addPage(page));
      }

      const mergedBytes = await merged.save();
      const mergedBuffer = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([mergedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "merged.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not merge these files. One PDF may be encrypted or damaged.");
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="page-title">
        <header className="topbar">
          <div>
            <p className="eyebrow">Browser-only PDF tool</p>
            <h1 id="page-title">PDF Merger</h1>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={isMerging || !items.length}
            onClick={mergePdfs}
          >
            {isMerging ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
            {isMerging ? "Merging" : "Download merged PDF"}
          </button>
        </header>

        <div
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files);
                event.target.value = "";
              }
            }}
          />
          <button
            className="upload-button"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={20} />
            Select PDFs
          </button>
          <p>Drop PDF files here to add them to the merge list.</p>
        </div>

        <section className="file-panel" aria-label="PDF files">
          <div className="panel-heading">
            <h2>Merge order</h2>
            {items.length > 0 && (
              <button className="text-button" type="button" onClick={() => setItems([])}>
                Clear all
              </button>
            )}
          </div>

          {items.length ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="file-list">
                  {items.map((item, index) => (
                    <SortablePdfRow
                      key={item.id}
                      item={item}
                      index={index}
                      onRemove={(id) =>
                        setItems((current) => current.filter((file) => file.id !== id))
                      }
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="empty-state">No PDFs selected yet.</div>
          )}
        </section>

        {error && <p className="error-message">{error}</p>}
      </section>
    </main>
  );
}
