
/* description: Parses and executes mathematical expressions. */

/* lexical grammar */
%lex
%%

\s+                   /* skip whitespace */
[a-zA-Z0-9.+/=]+	  return 'EVENTNAME'
"||"                  return '||'
"&&"                  return '&&'
"!"                   return '!'
"("                   return '('
")"                   return ')'
<<EOF>>               return 'EOF'
.                     return 'INVALID'

/lex

/* operator associations and precedence */

%left '||' '&&'
%right '!'

%start expressions

%% /* language grammar */

expressions
    : e EOF
        { typeof console !== 'undefined' ? console.log($1) : print($1);
          return $1; }
    ;

e
    : e '&&' e
        {$$ = $1 + '&&' + $3;}
    | e '||' e
        {$$ = $1 + '||' + $3;}
    | '!' e 
        {$$ = '! ' + $2;}
    | '(' e ')'
        {$$ = '(' + $2 +')';}
    | EVENTNAME
        {$$ = 'f("'+yytext+'")';}
    ;

