import liquid from './liquid.js'
import cheerio from 'cheerio'
import { encode } from 'html-entities'
import stripHtmlComments from 'strip-html-comments'
import createProcessor from './create-processor.js'

// used below to remove extra newlines in TOC lists
const endLine = '</a>\r?\n'
const blankLine = '\\s*?[\r\n]*'
const startNextLine = '[^\\S\r\n]*?[-\\*] <a'
const blankLineInList = new RegExp(`(${endLine})${blankLine}(${startNextLine})`, 'mg')

// used below to remove unwanted newlines from inline tags in tables
const inlineTags = ['a', 'code', 'em']
const inlineTagString = `(?:${inlineTags.join('|')})`
const inlineTagRegex = new RegExp(`\n?(</?${inlineTagString}>?)\n?`, 'gm')

// parse multiple times because some templates contain more templates. :]
async function renderContent(template = '', context = {}, options = {}) {
  // If called with a falsy template, it can't ever become something
  // when rendered. We can exit early to save some pointless work.
  if (!template) return template
  try {
    // remove any newlines that precede html comments, then remove the comments
    if (template) {
      template = stripHtmlComments(template.replace(/\n<!--/g, '<!--'))
    }

    template = await liquid.parseAndRender(template, context)

    // this workaround loses syntax highlighting but correctly handles tags like <em> and entities like &lt;
    template = template.replace(
      /``` ?shell\r?\n\s*?(\S[\s\S]*?)\r?\n.*?```/gm,
      '<div class="overflow-auto position-relative snippet-clipboard-content"><pre><code class="hljs language-shell">$1</code></pre><div class="clipboard-container position-absolute right-0 top-0"><button aria-label=Copy class="m-2 ClipboardButton btn js-clipboard-copy p-0"data-copy-feedback=Copied! role=button><svg aria-hidden=true class="m-2 octicon js-clipboard-copy-icon octicon-copy"data-view-component=true height=16 viewBox="0 0 16 16"width=16><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"fill-rule=evenodd></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"fill-rule=evenodd></path></svg> <svg aria-hidden=true class="m-2 octicon color-fg-success d-none js-clipboard-check-icon octicon-check"data-view-component=true height=16 viewBox="0 0 16 16"width=16><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"fill-rule=evenodd></path></svg></button></div></div>'
    )

    // clean up empty lines in TOC lists left by unrendered list items (due to productVersions)
    // for example, remove the blank line here:
    //    - <a>foo</a>
    //
    //    - <a>bar</a>
    if (template.includes('</a>')) {
      template = template.replace(blankLineInList, '$1$2')
    }

    // this removes any extra newlines left by (now resolved) liquid
    // statements so that extra space doesn't mess with list numbering
    template = template.replace(/(\r?\n){3}/g, '\n\n')

    const processor = createProcessor(context)
    const vFile = await processor.process(template)
    let html = vFile.toString()

    // Remove unwanted newlines (which appear as spaces) from inline tags inside tables
    if (html.includes('<table>')) html = removeNewlinesFromInlineTags(html)

    if (options.textOnly) {
      html = cheerio.load(html).text().trim()
    }

    if (options.cheerioObject) {
      return cheerio.load(html, { xmlMode: true })
    }

    if (options.encodeEntities) html = encode(html)

    return html.trim()
  } catch (error) {
    if (options.filename) {
      console.error(`renderContent failed on file: ${options.filename}`)
    }
    throw error
  }
}

function removeNewlinesFromInlineTags(html) {
  const $ = cheerio.load(html)

  // see https://cheerio.js.org/#html-htmlstring-
  $(inlineTags.join(','))
    .parents('td')
    .get()
    .map((tag) => $(tag).html($(tag).html().replace(inlineTagRegex, '$1')))

  return $('body').html()
}

renderContent.liquid = liquid

export default renderContent
