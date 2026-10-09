export interface PipelineFile {
  src: string;
  dst: string;
  rel: string;
  kind: "BP" | "RP";
  size: number;
  mtimeMs: number;
}

export interface ProcessorContext {
  release: boolean;
  settings?: Record<string, unknown>;
}

export interface BundleContext extends ProcessorContext {
  outputPath: string;
}

export interface FileProcessor {
  name: string;
  match(file: PipelineFile): boolean;
  remap?(file: PipelineFile): string | null;
  pre?(file: PipelineFile, ctx: ProcessorContext): Promise<void> | void;
  transform?(
    content: Uint8Array,
    file: PipelineFile,
    ctx: ProcessorContext,
  ): Promise<Uint8Array | null> | Uint8Array | null;
  post?(file: PipelineFile, ctx: ProcessorContext): Promise<void> | void;
  afterBundle?(
    content: Uint8Array,
    ctx: BundleContext,
  ): Promise<Uint8Array | null> | Uint8Array | null;
}
