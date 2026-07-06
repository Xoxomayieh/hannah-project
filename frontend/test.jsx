import React from "react";
import { renderToString } from "react-dom/server";
import ReactMarkdown from "react-markdown";

const text = "**I**'ll need these details to get you a solid plan:";

const App = () => (
  <ReactMarkdown
    components={{
      strong: ({node, ...props}) => <strong className="test" {...props} />
    }}
  >
    {text}
  </ReactMarkdown>
);

console.log(renderToString(<App />));
