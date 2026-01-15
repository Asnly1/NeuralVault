import { useState, useRef, useEffect } from "react";
import { Search, X, Loader2, FileText, Tag, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchSemantic, searchKeyword, warmupEmbedding, SemanticSearchResult, NodeRecord } from "@/api";
import { useLanguage } from "@/contexts/LanguageContext";

type SearchMode = "semantic" | "keyword";

interface SearchBarProps {
  onSelectResult?: (nodeId: number, nodeType: string, fullNode?: NodeRecord) => void;
}

export function SearchBar({ onSelectResult }: SearchBarProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("semantic");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [keywordResults, setKeywordResults] = useState<NodeRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const warmupAtRef = useRef<number | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setSemanticResults([]);
      setKeywordResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (mode === "semantic") {
          const results = await searchSemantic(query, undefined, "content", 10);
          setSemanticResults(results);
        } else {
          const results = await searchKeyword(query, undefined, 10);
          setKeywordResults(results);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, mode]);

  const handleFocus = () => {
    setIsOpen(true);
    const now = Date.now();
    const ttlMs = 5 * 60 * 1000;
    if (!warmupAtRef.current || now - warmupAtRef.current > ttlMs) {
      warmupAtRef.current = now;
      warmupEmbedding().catch((error) => {
        console.error("Embedding warmup failed:", error);
      });
    }
  };

  const handleClear = () => {
    setQuery("");
    setSemanticResults([]);
    setKeywordResults([]);
    inputRef.current?.focus();
  };

  const handleResultClick = (nodeId: number, nodeType: string, fullNode?: NodeRecord) => {
    onSelectResult?.(nodeId, nodeType, fullNode);
    setIsOpen(false);
    setQuery("");
  };

  const getNodeTypeIcon = (nodeType: string) => {
    switch (nodeType) {
      case "topic":
        return <Tag className="h-3.5 w-3.5 text-blue-500" />;
      case "task":
        return <CheckSquare className="h-3.5 w-3.5 text-green-500" />;
      case "resource":
      default:
        return <FileText className="h-3.5 w-3.5 text-orange-500" />;
    }
  };

  const hasResults = mode === "semantic"
    ? semanticResults.length > 0
    : keywordResults.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative group">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          placeholder={t("sidebar", "searchPlaceholder")}
          className="h-8 w-full rounded-md bg-muted/50 border border-transparent px-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:bg-muted focus:border-border/50 focus:outline-none transition-all"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
          {/* Mode Toggle */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setMode("semantic")}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "semantic"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {t("search", "semantic") || "Semantic"}
            </button>
            <button
              onClick={() => setMode("keyword")}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "keyword"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {t("search", "keyword") || "Keyword"}
            </button>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !query.trim() ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {t("search", "typeToSearch") || "Type to search..."}
              </div>
            ) : !hasResults ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {t("search", "noResults") || "No results found"}
              </div>
            ) : mode === "semantic" ? (
              // Semantic Results
              semanticResults.map((result) => (
                <button
                  key={result.node.node_id}
                  onClick={() => handleResultClick(result.node.node_id, result.node.node_type)}
                  className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                >
                  <div className="flex items-start gap-2">
                    {getNodeTypeIcon(result.node.node_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground font-medium truncate">
                        {result.node.title}
                      </p>
                      {result.node.summary && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                          {result.node.summary}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Score: {result.score.toFixed(3)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              // Keyword Results
              keywordResults.map((result) => (
                <button
                  key={result.node_id}
                  onClick={() => handleResultClick(result.node_id, result.node_type, result)}
                  className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                >
                  <div className="flex items-start gap-2">
                    {getNodeTypeIcon(result.node_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground font-medium truncate">
                        {result.title}
                      </p>
                      {result.summary && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                          {result.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
