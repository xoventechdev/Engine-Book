import { create } from 'zustand';

// ========== Types ==========

export type Discipline = 'BMS' | 'HVAC' | 'Electrical' | 'Fire Alarm' | 'Structural' | 'Civil' | 'MEP' | 'General';

export type ViewMode = 'dashboard' | 'workspace' | 'graph' | 'compare' | 'report';

export interface Note {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  discipline: string;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number };
}

export interface Document {
  id: string;
  projectId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  discipline: string;
  uploadedAt: string;
}

export interface ToolCallLogEntry {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[] | null;
  toolCalls?: ToolCallLogEntry[] | null;
  createdAt: string;
}

export interface Citation {
  documentName: string;
  page?: number;
  text?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'Equipment' | 'Spec' | 'Standard' | 'Location' | 'Value' | 'System' | 'Component' | 'Parameter';
  properties?: Record<string, string>;
  document?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ========== App Store ==========

interface AppState {
  // Navigation
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Current Project
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;

  // Documents
  documents: Document[];
  setDocuments: (docs: Document[]) => void;
  addDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;

  // Selected document for viewing
  selectedDocumentId: string | null;
  setSelectedDocumentId: (id: string | null) => void;

  // Citation jump target — when set, DocumentViewer opens the doc at this page
  jumpTarget: { documentId: string; page: number } | null;
  setJumpTarget: (target: { documentId: string; page: number } | null) => void;

  // Notes (pinned answers)
  notes: Note[];
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  removeNote: (id: string) => void;

  // Chat
  chatMessages: ChatMessage[];
  setChatMessages: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
  isChatLoading: boolean;
  setChatLoading: (loading: boolean) => void;

  // Pending chat input — set by InsightsPanel (suggested questions), consumed by ChatPanel
  pendingChatInput: string | null;
  setPendingChatInput: (input: string | null) => void;

  // Graph
  graphData: GraphData | null;
  setGraphData: (data: GraphData | null) => void;

  // UI State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  viewMode: 'dashboard',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Current Project
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),

  // Documents
  documents: [],
  setDocuments: (docs) => set({ documents: docs }),
  addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
  removeDocument: (id) => set((state) => ({ documents: state.documents.filter(d => d.id !== id) })),

  // Selected document
  selectedDocumentId: null,
  setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),

  // Citation jump target
  jumpTarget: null,
  setJumpTarget: (target) => set({ jumpTarget: target }),

  // Notes
  notes: [],
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
  removeNote: (id) => set((state) => ({ notes: state.notes.filter(n => n.id !== id) })),

  // Chat
  chatMessages: [],
  setChatMessages: (messages) => set({ chatMessages: messages }),
  addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  clearChatMessages: () => set({ chatMessages: [] }),
  isChatLoading: false,
  setChatLoading: (loading) => set({ isChatLoading: loading }),

  // Pending chat input
  pendingChatInput: null,
  setPendingChatInput: (input) => set({ pendingChatInput: input }),

  // Graph
  graphData: null,
  setGraphData: (data) => set({ graphData: data }),

  // UI State
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  chatOpen: true,
  setChatOpen: (open) => set({ chatOpen: open }),
}));