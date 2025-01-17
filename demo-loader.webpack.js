const path = require('path');
const pkg = require('./package.json');
const changeCase = require('change-case');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse');

module.exports = function demoLoader(source) {
  const callback = this.async();
  const parsed = parser.parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const files = [];
  traverse.default(parsed, {
    enter: function (node) {
      if (node.type === 'CallExpression') {
        if (node.node.callee.name === 'fetch') {
          const firstArg = node.node.arguments[0];
          if (firstArg.type === 'StringLiteral') {
            if (firstArg.value.startsWith('/')) {
              files.push(firstArg.value);
            } else {
              throw new Error(
                'fetch should only be used with a path starting with /',
              );
            }
          } else {
            throw new Error(
              'fetch should use a string literal as the first argument',
            );
          }
        }
      }
    },
  });

  const parsedAll = parsed.program.body;
  const defaultExport = parsedAll.find(
    (node) => node.type === 'ExportDefaultDeclaration',
  );
  const parsedBeforeDefaultExport = parsedAll.slice(0, parsedAll.length - 1);
  const parsedImports = parsedBeforeDefaultExport.filter(
    (statement) => statement.type === 'ImportDeclaration',
  );
  const defaultDeclaration = defaultExport.declaration;

  if (
    !defaultDeclaration ||
    defaultDeclaration.type !== 'FunctionDeclaration'
  ) {
    throw new Error(
      `
example should have a default export of function declaration.
Example:
  // import statements
  import React from 'react';
  import Plot from 'react-plot';
      
  // Default export of function declaration
  export default function Example(){};
      `,
    );
  }

  const codeSandboxDependencies = parsedImports.reduce((prev, current) => {
    const source = current.source.value;
    if (source.startsWith('.')) {
      console.warn(
        `in ${this.resourcePath}, import statements with relative path will not work in code sandbox`,
      );
    } else {
      prev[source] = pkg.dependencies[source];
    }
    return prev;
  }, {});

  const functionComponentSource = source.slice(
    defaultDeclaration.start,
    defaultDeclaration.end,
  );
  const beforeDefaultExportSource = source.slice(0, defaultExport.start);
  const afterDefaultExportSource = source.slice(defaultExport.end);
  const name = changeCase.paramCase(
    defaultDeclaration.id?.name || 'ReactPlotDemo',
  );

  const codeSandboxImportPath = path
    .relative(this.context, path.join('src', 'components', 'CodeSandboxer.tsx'))
    .replaceAll(path.sep, path.posix.sep);

  const modifiedSource = `
  ${beforeDefaultExportSource}
  import { useState as __useState__ } from 'react';
  import CodeBlock from '@theme/CodeBlock';
  import CodeSandboxer from '${codeSandboxImportPath}';
  
  const exampleSource = ${JSON.stringify(source)};
  const __EXAMPLE__ = ${functionComponentSource}

  export default function __EXAMPLE_DEMO__(props) {
    const [showCode, setShowCode] = __useState__(false);
    return (
      <>
        <div className="demo-example-wrapper">
          <__EXAMPLE__ />
          <div className="demo-example-buttons">
            <button
              onClick={() => setShowCode((show) => !show)}
              type="button"
              style={{
                backgroundColor: showCode ? '#dbeafe' : undefined,
              }}
            >
              Code
            </button>
            {props.noCodesandbox ? null : (
              <CodeSandboxer
                name="${name}"
                source={exampleSource}
                dependencies={${JSON.stringify(codeSandboxDependencies)}}
                publicFiles={${JSON.stringify(files)}}
              >
                {() => {
                  return <button type="submit">Open sandbox</button>;
                }}
              </CodeSandboxer>
            )}
          </div>
        </div>
        {showCode && (
          <CodeBlock className="language-jsx">{exampleSource}</CodeBlock>
        )}
      </>
    );
  }
  ${afterDefaultExportSource}
  `;
  babel
    .transformAsync(modifiedSource, {
      filename: this.resourcePath,
      presets: ['@babel/preset-typescript'],
    })
    .then((result) => {
      callback(null, result.code);
    })
    .catch((e) => callback(e));
};
