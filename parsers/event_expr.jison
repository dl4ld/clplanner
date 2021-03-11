
/* description: Parses and executes mathematical expressions. */

/* lexical grammar */
%lex
%options flex
%%

\s+                   /* skip whitespace */
[+-]?([0-9]*[.])?[0-9]+			return 'NUMBER'
"..."							return '...'
"||"							return '||'
"&&"							return '&&'
"!"								return '!'
"=="							return '=='
"<>"							return '<>'
">="							return '>='
"<="							return '<='
"<"								return '<'
">"								return '>'
"("								return '('
")"								return ')'
"["								return '['
"]"								return ']'
[a-zA-Z0-9]+[a-zA-Z0-9=.+/]*	return 'EVENTNAME'
<<EOF>>							return 'EOF'
.								return 'INVALID'

/lex

/* operator associations and precedence */

%left '||' '&&'
%left '<>' '==' '>' '<' '>=' '<='
%right '!'

%start expressions

%% /* language grammar */

expressions
    : e EOF
        { typeof console !== 'undefined' ? console.log($1) : print($1);
          return $1; }
    ;

COMP
	: '=='
		{$$ = yytext;}
	| '<'
		{$$ = yytext;}
	| '>'
		{$$ = yytext;}
	| '<='
		{$$ = yytext;}
	| '>='
		{$$ = yytext;}
	;

EV
    : EVENTNAME
         {$$ = yytext.substring(0, yytext.lenght);}
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
	| EV '<>' '[' NUMBER '...' NUMBER ']'
        {$$ = '(e["' + $1 + '"].value > '+ $4 + ' && e["' + $1 + '"].value < ' + $6 + ')';}
	| EV COMP NUMBER
        {$$ = 'e["' + $1 + '"].value '+ $2 + $3;}
    | EV
        {$$ = 'e["'+$1+'"].value';}
    ;

