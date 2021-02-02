

/* description: Parses and executes mathematical expressions. */

/* lexical grammar */
%lex
%%

\s+                   /*skip*/
\w+					  return 'WORD'
[0-9]+                return 'NUMBER'
"{{"                  return "{{"
"}}"                  return "}}"
"."                   return "."
<<EOF>>               return 'EOF'

/lex

/* operator associations and precedence */
%left '.'

%start expressions

%% /* language grammar */

expressions
    : e EOF
        { typeof console !== 'undefined' ? console.log($1) : print($1);
          return $1; }
    ;

e
    : "{{" e "}}"
        {$$ = 'tr(' + $2+ ')';}
    | e '.' e
	    {$$ = $1 + '+"."+' + $3}
    | WORD
        {$$ = '"' + yytext + '"';}
    | NUMBER
        {$$ = '"' + yytext + '"';}
    ;

