/**
Template-based resume generator base for FluentCV.
@license Copyright (c) 2015 | James M. Devlin
*/

var FS = require( 'fs' )
  , _ = require( 'underscore' )
  , MD = require( 'marked' )
  , XML = require( 'xml-escape' )
  , PATH = require('path')
  , BaseGenerator = require( './base-generator' )
  , EXTEND = require('../utils/extend')
  , Theme = require('../core/theme');

// Default options.
var _defaultOpts = {
  themeRelative: '../../node_modules/fluent-themes/themes',
  keepBreaks: true,
  freezeBreaks: true,
  nSym: '&newl;', // newline entity
  rSym: '&retn;', // return entity
  template: {
    interpolate: /\{\{(.+?)\}\}/g,
    escape: /\{\{\=(.+?)\}\}/g,
    evaluate: /\{\%(.+?)\%\}/g,
    comment: /\{\#(.+?)\#\}/g
  },
  filters: {
    out: function( txt ) { return txt; },
    raw: function( txt ) { return txt; },
    xml: function( txt ) { return XML(txt); },
    md: function( txt ) { return MD(txt); },
    mdin: function( txt ) { return MD(txt).replace(/^\s*\<p\>|\<\/p\>\s*$/gi, ''); },
    lower: function( txt ) { return txt.toLowerCase(); }
  },
  prettify: { // ← See https://github.com/beautify-web/js-beautify#options
    indent_size: 2,
    unformatted: ['em','strong'],
    max_char: 80, // ← See lib/html.js in above-linked repo
    //wrap_line_length: 120, <-- Don't use this
  }
};

/**
TemplateGenerator performs resume generation via Underscore-style template
expansion and is appropriate for text-based formats like HTML, plain text,
and XML versions of Microsoft Word, Excel, and OpenOffice.
*/
var TemplateGenerator = module.exports = BaseGenerator.extend({

  /** outputFormat: html, txt, pdf, doc
      templateFormat: html or txt
  **/
  init: function( outputFormat, templateFormat, cssFile ){
    this._super( outputFormat );
    this.tplFormat = templateFormat || outputFormat;
  },

  /** Default generation method for template-based generators. */
  invoke: function( rez, themeMarkup, cssInfo, opts ) {

    // Compile and invoke the template!
    this.opts = EXTEND( true, {}, _defaultOpts, opts );
    mk = this.single( rez, themeMarkup, this.format, cssInfo, { } );
    this.onBeforeSave && (mk = this.onBeforeSave( mk, themeFile, f ));
    return mk;

  },

  /** Default generation method for template-based generators. */
  generate: function( rez, f, opts ) {

    // Carry over options
    this.opts = EXTEND( true, { }, _defaultOpts, opts );

    // Verify the specified theme name/path
    var tFolder = PATH.resolve( __dirname, this.opts.themeRelative, this.opts.theme );
    var exists = require('../utils/file-exists');
    if (!exists( tFolder )) {
      tFolder = PATH.resolve( this.opts.theme );
      if (!exists( tFolder )) {
        throw { fluenterror: this.codes.themeNotFound, data: this.opts.theme };
      }
    }

    // Load the theme
    var theme = opts.themeObj || new Theme().open( tFolder );

    // Load theme and CSS data
    var tplFolder = PATH.join( tFolder, 'templates' );
    var curFmt = theme.getFormat( this.format );
    var ctx = { file: curFmt.css ? curFmt.cssPath : null, data: curFmt.css || null };

    // Compile and invoke the template!
    var mk = this.single( rez, curFmt.data, this.format, ctx, opts );
    this.onBeforeSave && (mk = this.onBeforeSave( mk, theme, f ));
    FS.writeFileSync( f, mk, { encoding: 'utf8', flags: 'w' } );

  },

  /**
  Perform a single resume JSON-to-DEST resume transformation. Exists as a
  separate function in order to expose string-based transformations to clients
  who don't have access to filesystem resources (in-browser, etc.).
  */
  single: function( json, jst, format, cssInfo, opts ) {

    // Freeze whitespace in the template.
    this.opts.freezeBreaks && ( jst = freeze(jst) );

    // Tweak underscore's default template delimeters
    _.templateSettings = this.opts.template;

    // Convert {{ someVar }} to {% print(filt.out(someVar) %}
    // Convert {{ someVar|someFilter }} to {% print(filt.someFilter(someVar) %}
    jst = jst.replace( _.templateSettings.interpolate, function replace(m, p1) {
      if( p1.indexOf('|') > -1 ) {
        var terms = p1.split('|');
        return '{% print( filt.' + terms[1] + '( ' + terms[0] + ' )) %}';
      }
      else {
        return '{% print( filt.out(' + p1 + ') ) %}';
      }
    });

    // Strip {# comments #}
    jst = jst.replace( _.templateSettings.comment, '');
    json.display_progress_bar = true;

    // Compile and run the template. TODO: avoid unnecessary recompiles.
    jst = _.template(jst)({ r: json, filt: this.opts.filters, cssInfo: cssInfo, headFragment: this.opts.headFragment || '' });

    // Unfreeze whitespace
    this.opts.freezeBreaks && ( jst = unfreeze(jst) );

    return jst;
  }


});

/**
Export the TemplateGenerator function/ctor.
*/
module.exports = TemplateGenerator;

/**
Freeze newlines for protection against errant JST parsers.
*/
function freeze( markup ) {
  return markup
    .replace( _reg.regN, _defaultOpts.nSym )
    .replace( _reg.regR, _defaultOpts.rSym );
}

/**
Unfreeze newlines when the coast is clear.
*/
function unfreeze( markup ) {
  return markup
    .replace( _reg.regSymR, '\r' )
    .replace( _reg.regSymN, '\n' );
}

/**
Regexes for linebreak preservation.
*/
var _reg = {
  regN: new RegExp( '\n', 'g' ),
  regR: new RegExp( '\r', 'g' ),
  regSymN: new RegExp( _defaultOpts.nSym, 'g' ),
  regSymR: new RegExp( _defaultOpts.rSym, 'g' )
};