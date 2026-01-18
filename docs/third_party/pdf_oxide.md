# Getting Started with PDFOxide (Rust)

PDFOxide is the complete PDF toolkit for Rust. One library for extracting, creating, and editing PDFs with a unified API.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
pdf_oxide = "0.3"
```

### Feature Flags

Select only the features you need:

```toml
[dependencies]
# Default - text extraction, creation, editing
pdf_oxide = "0.3"

# With barcode generation
pdf_oxide = { version = "0.3", features = ["barcodes"] }

# With Office document conversion (DOCX, XLSX, PPTX)
pdf_oxide = { version = "0.3", features = ["office"] }

# With digital signatures
pdf_oxide = { version = "0.3", features = ["signatures"] }

# With page rendering to images
pdf_oxide = { version = "0.3", features = ["rendering"] }

# All features
pdf_oxide = { version = "0.3", features = ["full"] }
```

## Quick Start - The Unified `Pdf` API

The `Pdf` class is your main entry point for all PDF operations:

```rust
use pdf_oxide::api::Pdf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create from Markdown
    let mut pdf = Pdf::from_markdown("# Hello World\n\nThis is a PDF.")?;
    pdf.save("output.pdf")?;

    Ok(())
}
```

## Creating PDFs

### From Markdown

```rust
use pdf_oxide::api::Pdf;

let mut pdf = Pdf::from_markdown(r#"
# Report Title

## Introduction

This is **bold** and *italic* text.

- Item 1
- Item 2
- Item 3

## Code Example

```python
print("Hello, World!")
```
"#)?;
pdf.save("report.pdf")?;
```

### From HTML

```rust
use pdf_oxide::api::Pdf;

let mut pdf = Pdf::from_html(r#"
<h1>Invoice</h1>
<p>Thank you for your purchase.</p>
<table>
    <tr><th>Item</th><th>Price</th></tr>
    <tr><td>Widget</td><td>$10.00</td></tr>
</table>
"#)?;
pdf.save("invoice.pdf")?;
```

### From Plain Text

```rust
use pdf_oxide::api::Pdf;

let mut pdf = Pdf::from_text("Simple plain text document.\n\nWith paragraphs.")?;
pdf.save("notes.pdf")?;
```

### From Images

```rust
use pdf_oxide::api::Pdf;

// Single image
let mut pdf = Pdf::from_image("photo.jpg")?;
pdf.save("photo.pdf")?;

// Multiple images (one per page)
let mut album = Pdf::from_images(&["page1.jpg", "page2.png", "page3.jpg"])?;
album.save("album.pdf")?;
```

## Opening and Reading PDFs

```rust
use pdf_oxide::api::Pdf;

// Open existing PDF
let mut pdf = Pdf::open("document.pdf")?;

// Extract text from page 0
let text = pdf.extract_text(0)?;
println!("Text: {}", text);

// Convert to Markdown
let markdown = pdf.to_markdown(0)?;
println!("Markdown:\n{}", markdown);

// Get page count
println!("Pages: {}", pdf.page_count());
```

## Editing PDFs

### DOM-like Navigation

```rust
use pdf_oxide::api::{Pdf, PdfElement};

let mut pdf = Pdf::open("document.pdf")?;

// Get a page for DOM-like access
let page = pdf.page(0)?;

// Find text elements
for text in page.find_text_containing("Hello") {
    println!("Found '{}' at {:?}", text.text(), text.bbox());
}

// Iterate through all elements
for element in page.children() {
    match element {
        PdfElement::Text(t) => println!("Text: {}", t.text()),
        PdfElement::Image(i) => println!("Image: {}x{}", i.width(), i.height()),
        PdfElement::Path(p) => println!("Path at {:?}", p.bbox()),
        _ => {}
    }
}
```

### Modifying Content

```rust
use pdf_oxide::api::Pdf;

let mut pdf = Pdf::open("document.pdf")?;

// Get mutable page
let mut page = pdf.page(0)?;

// Find and replace text
let texts = page.find_text_containing("old");
for t in &texts {
    page.set_text(t.id(), "new")?;
}

// Save changes back
pdf.save_page(page)?;
pdf.save("modified.pdf")?;
```

### Adding Annotations

```rust
use pdf_oxide::api::Pdf;

let mut pdf = Pdf::open("document.pdf")?;

// Add highlight
pdf.add_highlight(0, [100.0, 700.0, 300.0, 720.0], None)?;

// Add sticky note
pdf.add_sticky_note(0, 500.0, 750.0, "Review this section")?;

// Add link
pdf.add_link(0, [100.0, 600.0, 200.0, 620.0], "https://example.com")?;

pdf.save("annotated.pdf")?;
```

### Adding Form Fields

```rust
use pdf_oxide::api::Pdf;

let mut pdf = Pdf::open("form-template.pdf")?;

// Add text field
pdf.add_text_field("name", [100.0, 700.0, 300.0, 720.0])?;

// Add checkbox
pdf.add_checkbox("agree", [100.0, 650.0, 120.0, 670.0], false)?;

pdf.save("form.pdf")?;
```

## Builder Pattern for Advanced Creation

For full control over PDF creation, use `PdfBuilder`:

```rust
use pdf_oxide::api::PdfBuilder;
use pdf_oxide::writer::PageSize;

let mut pdf = PdfBuilder::new()
    .title("Annual Report 2025")
    .author("Company Inc.")
    .subject("Financial Summary")
    .page_size(PageSize::A4)
    .margins(72.0, 72.0, 72.0, 72.0)  // 1 inch margins
    .font_size(11.0)
    .from_markdown("# Annual Report\n\n...")?;

pdf.save("annual-report.pdf")?;
```

## Encryption and Security

### Password Protection

```rust
use pdf_oxide::api::Pdf;

let mut pdf = Pdf::from_markdown("# Confidential Document")?;

// Simple password protection (AES-256)
pdf.save_encrypted("secure.pdf", "user-password", Some("owner-password"))?;
```

### Advanced Encryption Options

```rust
use pdf_oxide::api::Pdf;
use pdf_oxide::editor::{EncryptionConfig, EncryptionAlgorithm, Permissions};

let mut pdf = Pdf::from_markdown("# Protected")?;

let config = EncryptionConfig::new("user", Some("owner"))
    .algorithm(EncryptionAlgorithm::Aes256)
    .permissions(Permissions::PRINT | Permissions::COPY);

pdf.save_with_encryption("protected.pdf", config)?;
```

## PDF Compliance

### PDF/A Validation and Conversion

```rust
use pdf_oxide::compliance::{PdfAValidator, PdfALevel, PdfAConverter};

// Validate
let validator = PdfAValidator::new();
let result = validator.validate_file("document.pdf", PdfALevel::PdfA2b)?;
if result.is_compliant {
    println!("PDF/A-2b compliant!");
} else {
    for error in result.errors {
        println!("Error: {:?}", error);
    }
}

// Convert to PDF/A
let converter = PdfAConverter::new(PdfALevel::PdfA2b);
converter.convert("input.pdf", "archive.pdf")?;
```

## Lower-Level APIs

For specialized use cases, PDFOxide provides lower-level APIs:

| API | Use Case |
|-----|----------|
| `PdfDocument` | Direct PDF parsing and text extraction |
| `DocumentBuilder` | Low-level PDF generation with full control |
| `DocumentEditor` | Direct editing without the `Pdf` wrapper |

### Using PdfDocument Directly

```rust
use pdf_oxide::PdfDocument;

let mut doc = PdfDocument::open("paper.pdf")?;

// Low-level text extraction with spans
let spans = doc.extract_spans(0)?;
for span in spans {
    println!("{} at ({}, {})", span.text, span.x, span.y);
}

// Access raw PDF objects
let page = doc.get_page(0)?;
let media_box = page.get("MediaBox");
```

### Using DocumentBuilder Directly

```rust
use pdf_oxide::writer::DocumentBuilder;

let mut builder = DocumentBuilder::new();
builder.add_page(612.0, 792.0)  // Letter size in points
    .text("Custom positioned text", 72.0, 720.0, 12.0)
    .rect(100.0, 600.0, 200.0, 50.0)
    .image_at("logo.png", 400.0, 700.0, 100.0, 50.0)?;

builder.save("custom.pdf")?;
```

## Examples

See the [examples/](../examples/) directory for complete working examples:

- `create_pdf_from_markdown.rs` - Creating PDFs from Markdown
- `edit_existing_pdf.rs` - Opening and modifying PDFs
- `edit_text_content.rs` - In-place text editing
- `add_form_fields.rs` - Interactive form creation
- `encrypt_pdf.rs` - Password protection

Run an example:

```bash
cargo run --example create_pdf_from_markdown
```

## Next Steps

- [PDF Creation Guide](PDF_CREATION_GUIDE.md) - Advanced creation options
- [Architecture](ARCHITECTURE.md) - Understanding the library structure
- [API Documentation](https://docs.rs/pdf_oxide) - Full API reference
