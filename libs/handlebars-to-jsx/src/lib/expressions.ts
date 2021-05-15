import { AST as Glimmer } from '@glimmer/syntax';
import * as Babel from '@babel/types';
import { createFragment, convertElement } from './elements';
import { resolveBlockStatement } from './block-statements';
import { createComment } from './comments';

/**
 * Converts the Handlebars expression to NON-JSX JS-compatible expression.
 * Creates top-level expression or expression which need to wrap to JSX
 * expression container.
 */
export const resolveStatement = (statement: Glimmer.Statement) => {
  switch (statement.type) {
    case 'ElementNode': {
      return convertElement(statement);
    }

    case 'TextNode': {
      return Babel.stringLiteral(statement.chars);
    }

    case 'MustacheStatement': {
      return resolveExpression(statement.path);
    }

    case 'BlockStatement': {
      return resolveBlockStatement(statement);
    }

    case 'MustacheCommentStatement':
    case 'CommentStatement': {
      throw new Error('Top level comments currently is not supported');
    }

    default: {
      throw new Error(`Unexpected expression "${statement.type}"`);
    }
  }
};

/**
 * Converts the Handlebars node to JSX-children-compatible child element.
 * Creates JSX expression or expression container with JS expression, to place
 * to children of a JSX element.
 */
export const resolveElementChild = (
  statement: Glimmer.Statement
):
  | Babel.JSXText
  | Babel.JSXElement
  | Babel.JSXExpressionContainer
  | Array<Babel.JSXText | Babel.JSXExpressionContainer> => {
  switch (statement.type) {
    case 'ElementNode': {
      return convertElement(statement);
    }

    case 'TextNode': {
      return prepareJsxText(statement.chars);
    }

    case 'MustacheCommentStatement':
    case 'CommentStatement': {
      return createComment(statement);
    }

    // If it expression, create a expression container
    default: {
      return Babel.jsxExpressionContainer(resolveStatement(statement));
    }
  }
};

/**
 * Converts Hbs expression to Babel expression
 */
export const resolveExpression = (
  expression: Glimmer.Expression
): Babel.Literal | Babel.Identifier | Babel.MemberExpression => {
  switch (expression.type) {
    case 'PathExpression': {
      return createPath(expression);
    }

    case 'BooleanLiteral': {
      return Babel.booleanLiteral(expression.value);
    }

    case 'NullLiteral': {
      return Babel.nullLiteral();
    }

    case 'NumberLiteral': {
      return Babel.numericLiteral(expression.value);
    }

    case 'StringLiteral': {
      return Babel.stringLiteral(expression.value);
    }

    case 'UndefinedLiteral': {
      return Babel.identifier('undefined');
    }

    default: {
      throw new Error('Unexpected mustache statement');
    }
  }
};

/**
 * Returns path to variable
 */
export const createPath = (
  pathExpression: Glimmer.PathExpression
): Babel.Identifier | Babel.MemberExpression => {
  const parts = pathExpression.parts;

  if (parts.length === 0) {
    throw new Error('Unexpected empty expression parts');
  }

  // Start identifier
  let acc: Babel.Identifier | Babel.MemberExpression = Babel.identifier(
    parts[0]
  );

  for (let i = 1; i < parts.length; i++) {
    acc = appendToPath(acc, Babel.identifier(parts[i]));
  }

  return acc;
};

/**
 * Appends item to path
 */
export const appendToPath = (
  path: Babel.MemberExpression | Babel.Identifier,
  append: Babel.Identifier
) => Babel.memberExpression(path, append);

/**
 * Prepends item to path
 */
export const prependToPath = (
  path: Babel.MemberExpression | Babel.Identifier,
  prepend: Babel.Identifier
) => Babel.memberExpression(prepend, path);

/**
 * Converts child statements of element to JSX-compatible expressions
 * @param body List of Glimmer statements
 */
export const createChildren = (
  body: Glimmer.Statement[]
): Babel.JSXElement['children'] =>
  body.reduce((acc, statement) => {
    const child = resolveElementChild(statement);

    return Array.isArray(child) ? [...acc, ...child] : [...acc, child];
  }, [] as Babel.JSXElement['children']);

/**
 * Converts root children
 */
export const createRootChildren = (
  body: Glimmer.Statement[]
): Babel.Expression =>
  body.length === 1
    ? resolveStatement(body[0])
    : createFragment(createChildren(body));

/**
 * Creates attribute value concatenation
 */
export const createConcat = (
  parts: Glimmer.ConcatStatement['parts']
): Babel.BinaryExpression | Babel.Expression => {
  return parts.reduce((acc, item) => {
    if (acc == null) {
      return resolveStatement(item);
    }

    return Babel.binaryExpression('+', acc, resolveStatement(item));
  }, null as null | Babel.Expression | Babel.BinaryExpression) as
    | Babel.BinaryExpression
    | Babel.Expression;
};

/**
 * Escapes syntax chars in jsx text
 * @param text
 */
export const prepareJsxText = (
  text: string
): Babel.JSXText | Array<Babel.JSXText | Babel.JSXExpressionContainer> => {
  // Escape jsx syntax chars
  const parts = text.split(/(:?{|})/);

  if (parts.length === 1) {
    return Babel.jsxText(text);
  }

  return parts.map((item) =>
    item === '{' || item === '}'
      ? Babel.jsxExpressionContainer(Babel.stringLiteral(item))
      : Babel.jsxText(item)
  );
};
