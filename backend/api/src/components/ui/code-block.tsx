import { cn } from "@/lib/utils";
import { useEffect } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export const CodeBlock = ({ code, language, className }: CodeBlockProps) => {
  useEffect(() => {
    Prism.highlightAll();
  }, [code]);

  return (
    <pre className={cn(
      "p-4 bg-gray-900 text-gray-100 rounded-md overflow-x-auto",
      className
    )}>
      <code className={language ? `language-${language}` : undefined}>
        {code}
      </code>
    </pre>
  );
}; 