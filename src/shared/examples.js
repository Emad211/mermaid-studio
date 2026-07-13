/**
 * A curated gallery of example diagrams, one per major Mermaid diagram type.
 * Surfaced in the GUI "Examples" menu and written to disk as .mmd files.
 */

export const EXAMPLES = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    code: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it 🚀]
    B -- No --> D[Debug]
    D --> B
    C --> E[Celebrate 🎉]`,
  },
  {
    id: 'sequence',
    label: 'Sequence',
    code: `sequenceDiagram
    autonumber
    participant U as User
    participant CLI as Mermaid Studio
    participant B as Headless Chrome
    U->>CLI: render diagram.mmd
    CLI->>B: load mermaid + code
    B-->>CLI: SVG / PNG / PDF
    CLI-->>U: out.png ✔`,
  },
  {
    id: 'class',
    label: 'Class',
    code: `classDiagram
    class Animal {
      +String name
      +int age
      +makeSound() void
    }
    class Dog {
      +fetch() void
    }
    class Cat {
      +scratch() void
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
  },
  {
    id: 'state',
    label: 'State',
    code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Rendering: render()
    Rendering --> Done: success
    Rendering --> Error: failure
    Error --> Idle: retry
    Done --> [*]`,
  },
  {
    id: 'er',
    label: 'ER',
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER {
      string name
      string email
    }
    ORDER {
      int id
      date createdAt
    }`,
  },
  {
    id: 'gantt',
    label: 'Gantt',
    code: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Design
    Spec        :done,    des1, 2026-01-01, 7d
    Mockups     :active,  des2, after des1, 5d
    section Build
    CLI         :         dev1, after des2, 10d
    GUI         :         dev2, after des2, 12d`,
  },
  {
    id: 'pie',
    label: 'Pie',
    code: `pie showData
    title Output formats requested
    "SVG" : 45
    "PNG" : 40
    "PDF" : 15`,
  },
  {
    id: 'mindmap',
    label: 'Mindmap',
    code: `mindmap
  root((Mermaid Studio))
    CLI
      render
      batch
      watch
    GUI
      live preview
      pan & zoom
      export
    Formats
      SVG
      PNG
      PDF`,
  },
  {
    id: 'gitgraph',
    label: 'Git graph',
    code: `gitGraph
    commit id: "init"
    branch feature
    checkout feature
    commit id: "cli"
    commit id: "gui"
    checkout main
    merge feature
    commit id: "release"`,
  },
  {
    id: 'journey',
    label: 'Journey',
    code: `journey
    title Using Mermaid Studio
    section Setup
      Install: 5: Me
      Run serve: 5: Me
    section Create
      Write diagram: 4: Me
      See preview: 5: Me
      Export PNG: 5: Me`,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    code: `timeline
    title Mermaid Studio roadmap
    2026 Q1 : CLI : Live GUI
    2026 Q2 : Batch render : Watch mode
    2026 Q3 : Themes : PDF export`,
  },
  {
    id: 'quadrant',
    label: 'Quadrant',
    code: `quadrantChart
    title Effort vs Impact
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Do now
    quadrant-2 Plan
    quadrant-3 Drop
    quadrant-4 Quick wins
    CLI: [0.3, 0.8]
    GUI: [0.7, 0.9]
    Docs: [0.4, 0.4]`,
  },
  {
    id: 'architecture',
    label: 'Architecture (icons)',
    code: `architecture-beta
    group cloud(logos:aws)[Cloud]
    service api(logos:aws-lambda)[API] in cloud
    service db(logos:aws-rds)[Database] in cloud
    service store(logos:aws-s3)[Storage] in cloud
    api:R --> L:db
    api:B --> T:store`,
  },
  {
    id: 'math',
    label: 'Math (KaTeX)',
    code: `flowchart LR
    A["$$E = mc^2$$"] --> B["$$\\int_0^\\infty e^{-x}\\,dx = 1$$"]
    B --> C["Proven ✓"]`,
  },
  {
    id: 'c4',
    label: 'C4 context',
    code: `C4Context
    title System Context — Mermaid Studio
    Person(user, "User", "Writes diagrams")
    System(studio, "Mermaid Studio", "Local CLI + GUI renderer")
    System_Ext(browser, "Headless Chrome", "Renders to image/PDF")
    Rel(user, studio, "Uses")
    Rel(studio, browser, "Drives")`,
  },
  {
    id: 'sankey',
    label: 'Sankey',
    code: `sankey-beta

Input,Render,40
Input,Validate,10
Render,SVG,18
Render,PNG,14
Render,PDF,8`,
  },
  {
    id: 'xychart',
    label: 'XY chart',
    code: `xychart-beta
    title "Exports per format"
    x-axis [svg, png, jpg, webp, pdf]
    y-axis "Count" 0 --> 100
    bar [80, 65, 30, 25, 40]
    line [80, 65, 30, 25, 40]`,
  },
];

/** The diagram shown when the GUI first loads. */
export const DEFAULT_DIAGRAM = EXAMPLES[0].code;

export function getExample(id) {
  return EXAMPLES.find((e) => e.id === id);
}
