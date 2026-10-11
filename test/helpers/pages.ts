// html shaped like the site's /subtitle/<slug>/ page, with invented values

export const UPLOADS = 'https://miraianime.net/wp-content/uploads'
export const badge = (n: string) => `<span style="background: #607d8b; padding: 0px 5px; border-radius: 4px; margin: 5px; color: white;">${n}</span>`

export interface Make {
  episodes?: string
  size?: string
  release?: string
  translators?: string[]
  links?: string[]
}

// same shape the site renders, with invented values
export function block ({ episodes = badge('01'), size = '13.36 كيلوبايت', release = 'WEB', translators = ['Cr'], links = [`${UPLOADS}/Cr-Show-01.zip`] }: Make = {}) {
  return `<div class="post-inner"><div class="entry fansub-details"><table><caption><i class="fa fa-info-circle"></i> معلومات عن الملف </caption><tbody>
<tr><th>ارقام الحلقات المتوفرة</th><td style="padding-right: 8px"><i class="fa-duotone fa-language"></i>${episodes}</td></tr>
<tr><th>حجم الملف</th><td><i class="fa fa-hdd-o fa-fw"></i> ${size} </td></tr>
<tr><th>الاصدار المتوافق</th><td style="padding-right: 8px"><i class="fa-duotone fa-square-poll-vertical"></i><span style="background: hotpink;"> ${release} </span></td></tr>
<tr><th>المترجم</th><td><i class="fa fa-users fa-fw"></i><span style="display: flex;">${translators.map(t => `<a style="x" href="https://miraianime.net/subtitles/?fansub=${t}">${t}</a>`).join('')}</span></td></tr>
</tbody></table></div><div class="links-file">${links.map(l => `<a class="download-file more-link" href="${l}"><i class="fa fa-download"></i> تحميل</a>`).join('')}</div><div class="clear"></div></div>`
}

export const page = (...blocks: string[]) => `<html><body><div class="box-all">${blocks.join('\n')}</div>
<div class="links-file"><a class="download-file more-link" href="https://miraianime.net/subtitles/">مكتبة</a></div></body></html>`
