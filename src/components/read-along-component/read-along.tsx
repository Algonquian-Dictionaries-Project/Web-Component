import { Component, Element, Listen, Prop, State } from '@stencil/core';
import { distinctUntilChanged } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { Howl } from 'howler';
import { Alignment, Page, parseSMIL, parseTEI, Sprite } from '../../utils/utils'

@Component({
  tag: 'read-along',
  styleUrl: '../../scss/styles.scss',
  shadow: true
})
export class ReadAlongComponent {
  @Element() el: HTMLElement;


  /************
   *  PROPS   *
   ************/

  /**
   * The text as TEI
   */
  @Prop() text: string;

  processed_text: JSX.Element;

  /**
   * The alignment as SMIL
   */
  @Prop() alignment: string;

  processed_alignment: Alignment;

  /**
   * The audio file
   */
  @Prop() audio: string;

  audio_howl_sprites: Howl;
  reading$: Subject<string>; // An RxJs Subject for the current item being read.
  duration: number; // Duration of the audio file

  /**
   * Overlay
   * This is an SVG overlay to place over the progress bar
   */
  @Prop() svg_overlay: string;

  /**
  * Theme to use: ['light', 'dark'] defaults to 'dark'
  */
  @Prop({ mutable: true }) theme: string = 'light';

  /**
   * Language
   */
  @Prop() language: string = 'eng';


  /************
   *  STATES  *
   ************/

  /**
   * Whether audio is playing or not
   */
  @State() playing: boolean = false;

  play_id: number;
  playback_rate: number = 1;

  @State() fullscreen: boolean = false;

  @State() autoScroll: boolean = true;
  showGuide: boolean = false;

  page_info;

  current_page;

  /************
  *  LISTENERS  *
  ************/

  @Listen('window:wheel')
  wheelHandler(event: MouseEvent): void {
    // only show guide if there is an actual highlighted element
    if (this.el.shadowRoot.querySelector('.reading')) {
      if (event['path'][0].classList.contains("sentence__word") ||
        event['path'][0].classList.contains("sentence__container") ||
        event['path'][0].classList.contains("sentence")) {
        if (this.autoScroll) {
          let reading_el: HTMLElement = this.el.shadowRoot.querySelector('.reading')
          if (reading_el) {
            this.autoScroll = !this.inPageContentOverflow(reading_el);
            this.showGuide = !this.autoScroll;
          }
        }
      }
    }
  }

  /***********
   *  UTILS  *
   ***********/

  /**
  * Given an audio file path and a parsed alignment object,
  * build a Sprite object
  * @param audio
  * @param alignment
  */
  private buildSprite(audio: string, alignment: Alignment) {
    return new Sprite({
      src: [audio],
      sprite: alignment,
      rate: this.playback_rate
    });
  }

  /**
   * Add escape characters to query selector param
   * @param id
   */
  tagToQuery(id: string): string {
    id = id.replace(".", "\\.")
    id = id.replace("#", "\\#")
    return "#" + id
  }

  /**
   * Return HTML element of word closest to second s
   *
   * @param s seconds
   */
  returnWordClosestTo(s: number): HTMLElement {
    let keys = Object.keys(this.processed_alignment)
    // remove 'all' sprite as it's not a word.
    keys.pop()
    for (var i = 1; i < keys.length; i++) {
      if (s * 1000 > this.processed_alignment[keys[i]][0]
        && this.processed_alignment[keys[i + 1]]
        && s * 1000 < this.processed_alignment[keys[i + 1]][0]) {
        return this.el.shadowRoot.querySelector(this.tagToQuery(keys[i]))
      }
    }
  }


  /*************
   *   AUDIO   *
   *************/

  /**
  * Change playback between .75 and 1.25. To change the playback options, 
  * change the HTML in the function renderControlPanel
  *
  * @param ev
  */
  changePlayback(ev: Event): void {
    let inputEl = ev.currentTarget as HTMLInputElement;
    let absolute_rate: number = parseInt(inputEl.value) / 100
    this.playback_rate = absolute_rate
    this.audio_howl_sprites.sound.rate(this.playback_rate)
  }

  /**
   *  Go back s milliseconds
   *
   * @param s
   */

  goBack(s: number): void {
    this.autoScroll = false;
    if (this.play_id) {
      this.audio_howl_sprites.goBack(this.play_id, s)
    }
    setTimeout(() => this.autoScroll = true, 100)
  }

  /**
   * Go to seek
   *
   * @param s number
   * 
   */
  goTo(seek: number): void {
    if (this.play_id === undefined) {
      this.play();
      this.pause();
    }
    this.autoScroll = false;
    seek = seek / 1000
    this.audio_howl_sprites.goTo(this.play_id, seek)
    setTimeout(() => this.autoScroll = true, 100)
  }

  /**
   * Go to seek from id
   *
   * @param ev
   */
  goToSeekAtEl(ev: MouseEvent): string {
    let el = ev.currentTarget as HTMLElement
    var tag = el.id;
    let seek = this.processed_alignment[tag][0]
    this.goTo(seek)
    return tag
  }

  /**
   * Go to seek from progress bar
   */
  goToSeekFromProgress(ev: MouseEvent): void {
    let el = ev.currentTarget as HTMLElement;
    let client_rect = el.getBoundingClientRect()
    // get offset of clicked element
    let offset = client_rect.left
    // get width of clicked element
    let width = client_rect.width
    // get click point
    let click = ev.pageX - offset
    // get seek in milliseconds
    let seek = ((click / width) * this.duration) * 1000
    this.goTo(seek)
  }



  /**
   * Pause audio.
   */
  pause(): void {
    this.playing = false;
    this.audio_howl_sprites.pause()
  }


  /**
  * Play the current audio, or start a new play of all
  * the audio
  * @param id string
  * 
  */
  play() {
    this.playing = true;
    // If already playing once, continue playing
    if (this.play_id !== undefined) {
      this.play_id = this.audio_howl_sprites.play(this.play_id)
    } else {
      // else, start a new play
      this.play_id = this.audio_howl_sprites.play('all')
    }
    // animate the progress bar
    this.animateProgress()

  }

  /**
   * Seek to an element with id 'id', then play it
   *
   * @param ev
   */
  playSprite(ev: MouseEvent): void {
    var tag = this.goToSeekAtEl(ev)
    if (!this.playing) {
      this.audio_howl_sprites.play(tag)
    }
  }


  /**
   * Stop the sound and remove all active reading styling
   */
  stop(): void {
    this.playing = false;
    this.audio_howl_sprites.stop()
    this.el.shadowRoot.querySelectorAll(".reading").forEach(x => x.classList.remove('reading'))

    if (!this.autoScroll) {
      this.autoScroll = true;
      this.showGuide = false;
    }

  }

  /*************
   * ANIMATION *
   *************/

  /**
   * Remove highlighting from every other word and add it to el
   *
   * @param el
   */
  addHighlightingTo(el: HTMLElement): void {
    this.el.shadowRoot.querySelectorAll(".reading").forEach(x => x.classList.remove('reading'))
    el.classList.add('reading')
  }

  /**
   * Animate the progress through the overlay svg
   */
  animateProgressWithOverlay(): void {
    // select svg container
    let wave__container: any = this.el.shadowRoot.querySelector('#overlay__object')
    // use svg container to grab fill and trail
    let fill: HTMLElement = wave__container.contentDocument.querySelector('#progress-fill')
    let trail = wave__container.contentDocument.querySelector('#progress-trail')
    let base = wave__container.contentDocument.querySelector('#progress-base')
    fill.classList.add('stop-color--' + this.theme)
    base.classList.add('stop-color--' + this.theme)

    // push them to array to be changed in step()
    this.audio_howl_sprites.sounds.push(fill)
    this.audio_howl_sprites.sounds.push(trail)
    // When this sound is finished, remove the progress element.
    this.audio_howl_sprites.sound.once('end', () => {
      this.audio_howl_sprites.sounds.forEach(x => {
        x.setAttribute("offset", '0%');
      });
      this.el.shadowRoot.querySelectorAll(".reading").forEach(x => x.classList.remove('reading'))
      this.playing = false;
      // }
    }, this.play_id);
  }

  /**
   * Animate the progress if no svg overlay is provided
   * 
   * @param play_id
   * @param tag
   */
  animateProgressDefault(play_id: number, tag: string): void {
    var elm = document.createElement('div');
    elm.className = 'progress theme--' + this.theme;
    elm.id = play_id.toString();
    elm.dataset.sprite = tag;
    let query = this.tagToQuery(tag);
    this.el.shadowRoot.querySelector(query).appendChild(elm);
    this.audio_howl_sprites.sounds.push(elm);

    // When this sound is finished, remove the progress element.
    this.audio_howl_sprites.sound.once('end', () => {
      // this.audio_howl_sprites = [];
      this.el.shadowRoot.querySelectorAll(".reading").forEach(x => x.classList.remove('reading'))
      this.playing = false;
      // }
    }, this.play_id);
  }

  /**
   * Animate progress, either by default or with svg overlay.
   */
  animateProgress(play_id = this.play_id): void {
    // Start animating progress
    if (this.svg_overlay) {
      // either with svg overlay
      this.animateProgressWithOverlay();
    } else {
      // or default progress bar
      this.animateProgressDefault(play_id, 'all');
    }
  }


  /**
   * Change fill colour to match theme
   */
  changeFill(): void {
    // Get theme contrast from the computed color of a word
    let contrast_el = this.el.shadowRoot.querySelector('.sentence__word')
    let contrast = window.getComputedStyle(contrast_el).color

    // select svg container
    let wave__container: any = this.el.shadowRoot.querySelector('#overlay__object')

    // use svg container to grab fill and trail
    let fill = wave__container.contentDocument.querySelector('#progress-fill')
    let base = wave__container.contentDocument.querySelector('#progress-base')

    // select polygon
    let polygon = wave__container.contentDocument.querySelector('#polygon')
    polygon.setAttribute('stroke', contrast)

    base.setAttribute('stop-color', contrast)
    fill.setAttribute('stop-color', contrast)
  }

  /**
   * Change theme
   */
  changeTheme(): void {
    if (this.theme === 'light') {
      this.theme = 'dark'
    } else {
      this.theme = 'light'
    }
  }

  /**
   * Make Fullscreen
   */
  private toggleFullscreen(): void {
    if (!this.fullscreen) {
      var elem: any = this.el.shadowRoot.getElementById('read-along-container');
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.mozRequestFullScreen) { /* Firefox */
        elem.mozRequestFullScreen();
      } else if (elem.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
        elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) { /* IE/Edge */
        elem.msRequestFullscreen();
      }
      this.el.shadowRoot.getElementById('read-along-container')
        .classList.add('read-along-container--fullscreen');
    } else {
      var document: any = this.el.ownerDocument
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) { /* Firefox */
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE/Edge */
        document.msExitFullscreen();
      }
      this.el.shadowRoot.getElementById('read-along-container')
        .classList.remove('read-along-container--fullscreen');
    }
    this.fullscreen = !this.fullscreen
  }

  /*************
   * SCROLLING *
   *************/

  hideGuideAndScroll(): void {
    let reading_el: HTMLElement = this.el.shadowRoot.querySelector('.reading')
    // observe when element is scrolled to, then remove the scroll guide and unobserve
    let intersectionObserver = new IntersectionObserver((entries) => {
      let [entry] = entries;
      if (entry.isIntersecting) {
        setTimeout(() => { this.showGuide = false; this.autoScroll = true }, 100)
        intersectionObserver.unobserve(reading_el)
      }
    })
    intersectionObserver.observe(reading_el)
    this.scrollTo(reading_el)
  }

  inPageContentOverflow(element: HTMLElement): boolean {
    let page_el = this.el.shadowRoot.querySelector('#' + this.current_page)
    let sent_el = page_el.querySelector('.sentence__container');
    let sent_rect = sent_el.getBoundingClientRect()
    let el_rect = element.getBoundingClientRect()
    // element being read is below/ahead of the words being viewed
    let inOverflowBelow = el_rect.top + el_rect.height > sent_rect.top + sent_rect.height
    // element being read is above/behind of the words being viewed
    let inOverflowAbove = el_rect.top + el_rect.height < 0

    let intersectionObserver = new IntersectionObserver((entries) => {
      let [entry] = entries;
      if (entry.isIntersecting) {
        setTimeout(() => { this.showGuide = false; this.autoScroll = true }, 100)
        intersectionObserver.unobserve(element)
      }
    })
    intersectionObserver.observe(element)

    // if not in overflow, return false
    return (inOverflowAbove || inOverflowBelow)
  }

  inPage(element: HTMLElement): boolean {
    let sent_el = this.el.shadowRoot.querySelector('.sentence__container');
    let sent_rect = sent_el.getBoundingClientRect()
    let el_rect = element.getBoundingClientRect()
    // element being read is below/ahead of the words being viewed
    let inOverflowBelow = el_rect.top + el_rect.height > sent_rect.top + sent_rect.height
    // element being read is above/behind of the words being viewed
    let inOverflowAbove = el_rect.top + el_rect.height < 0


    let intersectionObserver = new IntersectionObserver((entries) => {
      let [entry] = entries;
      if (entry.isIntersecting) {
        setTimeout(() => { this.showGuide = false; this.autoScroll = true }, 100)
        intersectionObserver.unobserve(element)
      }
    })
    intersectionObserver.observe(element)
    console.log((inOverflowAbove || inOverflowBelow))
    // if not in overflow, return false
    return (inOverflowAbove || inOverflowBelow)
  }

  scrollToPage(pg_id: string): void {
    let next_page = this.el.shadowRoot.querySelector('#' + pg_id)
    next_page.scrollIntoView({ behavior: "smooth" })
  }

  scrollByHeight(el: HTMLElement): void {
    let page_el = this.el.shadowRoot.querySelector('#' + this.current_page)
    let sent_container = page_el.querySelector('.sentence__container');
    let anchor = el.getBoundingClientRect()
    sent_container.scrollBy({
      top: sent_container.getBoundingClientRect().height - anchor.height, // negative value acceptable
      left: 0,
      behavior: 'smooth'
    });
  }

  scrollTo(el: HTMLElement): void {
    el.scrollIntoView({
      behavior: 'smooth'
    });
  }

  /*************
   * LIFECYCLE *
   *************/

  /**
   * When the component updates, change the fill of the progress bar.
   * This is because the fill colour is determined by a computed CSS
   * value set by the Web Component's theme. When the @prop theme changes and
   * the component updates, we have to update the fill with the new
   * computed CSS value.
   */
  componentDidUpdate() {
    if (this.svg_overlay) {
      this.changeFill()
    }
  }

  /**
   * Lifecycle hook: Before component loads, build the Sprite and parse the files necessary.
   * Then subscribe to the _reading$ Subject in order to update CSS styles when new element 
   * is being read
   */
  componentWillLoad() {
    this.processed_alignment = parseSMIL(this.alignment)
    // load basic Howl
    this.audio_howl_sprites = new Howl({
      src: [this.audio],
      preload: true
    })
    // Once loaded, get duration and build Sprite
    this.audio_howl_sprites.once('load', () => {
      this.processed_alignment['all'] = [0, this.audio_howl_sprites.duration() * 1000];
      this.duration = this.audio_howl_sprites.duration();
      this.audio_howl_sprites = this.buildSprite(this.audio, this.processed_alignment);
      // Once Sprites are built, subscribe to reading subject and update element class
      // when new distinct values are emitted
      this.reading$ = this.audio_howl_sprites._reading$.pipe(
        distinctUntilChanged()
      ).subscribe(el_tag => {
        // Only highlight when playing
        if (this.playing) {
          // Turn tag to query
          let query = this.tagToQuery(el_tag);
          // select the element with that tag
          let query_el: HTMLElement = this.el.shadowRoot.querySelector(query);
          // Remove all elements with reading class
          this.el.shadowRoot.querySelectorAll(".reading").forEach(x => x.classList.remove('reading'))
          // Add reading to the selected el
          query_el.classList.add('reading')
          // Scroll horizontally (to different page) if needed
          let current_page = query_el.parentElement.parentElement.parentElement.id
          if (current_page !== this.current_page) {
            this.current_page = current_page
            this.scrollToPage(current_page)
          }
          // scroll vertically (through paragraph) if needed
          if (this.inPageContentOverflow(query_el)) {
            if (this.autoScroll) {
              this.scrollByHeight(query_el)
            }
          }
        }
      })
    })

    this.processed_text = this.renderText()
  }

  /**********
   *  LANG  *
   **********/

  /**
   * Any text used in the Web Component should be at least bilingual in English and French.
   * To add a new term, add a new key to the translations object. Then add 'eng' and 'fr' keys
   * and give the translations as values.
   * 
   * @param word
   * @param lang
   */
  returnTranslation(word: string, lang: string): string {
    let translations = {
      "speed": {
        "eng": "Playback Speed",
        "fr": "Vitesse de Lecture"
      },
      "re-align": {
        "eng": "Re-align with audio",
        "fr": "Réaligner avec l'audio"
      }
    }
    return translations[word][lang]
  }

  /**********
   * RENDER *
   **********/

  /**
   * Render the guide for getting back to the current element.
   */
  renderGuide(): JSX.Element {
    if (this.showGuide) {
      return <button class={'scroll-guide__container ripple ui-button theme--' + this.theme}
        onClick={() => this.hideGuideAndScroll()}>
        <span class={'scroll-guide__text theme--' + this.theme}>
          {this.returnTranslation('re-align', this.language)}
        </span>
      </button>
    }
  }

  /**
   * Render svg overlay
   */
  private renderOverlay(): JSX.Element {
    if (this.svg_overlay) {
      return <object onClick={(e) => this.goToSeekFromProgress(e)} id='overlay__object' type='image/svg+xml' data={this.svg_overlay}></object>
    }
  }

  /**
   * Render image at path 'url' in assets folder.
   * 
   * @param url
   */
  private renderImg(url: string): JSX.Element {
    if (url) {
      url = `assets/${url}`;
      return <div class={"image__container page__col__image theme--" + this.theme}>
        <img class="image" src={url} />
      </div>
    }
  }

  /**
   * Render the page count
   * 
   * @param pg_count
   * @param parsed_tei
   * @param page 
   */
  private renderPageCount(pg_count: number, parsed_tei: Page[], page: Page) {
    if (pg_count > 1) {
      return <div class={"page__counter color--" + this.theme}>Page {parsed_tei.indexOf(page) + 1} / {pg_count}</div>
    }
  }

  private renderParagraphs(paragraphs: Node[]): JSX.Element {
    return paragraphs.map((paragraph: Node) =>
      <div class={'page__col__text paragraph sentence__container theme--' + this.theme}>
        {Array.from(paragraph.childNodes).map((sentence: Node) =>
          <div class='sentence'>
            {Array.from(sentence.childNodes).map((child: Node) => {
              if (child.nodeName === '#text') {
                return <span class={'sentence__text theme--' + this.theme} id='text'>{child['textContent']}</span>
              } else if (child.nodeName === 'w') {
                return <span class={'sentence__word theme--' + this.theme} id={child['id']} onClick={(ev) => this.playSprite(ev)}>{child['textContent']}</span>
              }
            })}
          </div>)}
      </div>)
  }

  private renderPages(): JSX.Element {
    let pg_count = this.page_info.length
    if (pg_count > 1) {
      let pages = this.page_info.map((page) =>
        <div class={'page page--multi animate-transition paragraph__container theme--' + this.theme} id={page['id']}>
          {this.renderPageCount(pg_count, this.page_info, page)}
          {this.renderImg(page['img'])}
          {this.renderParagraphs(page['paragraphs'])}
        </div>)
      return pages
    } else {
      let page = this.page_info[0]
      return <div class={'page page--single animate-transition paragraph__container theme--' + this.theme} id={page['id']}>
        {this.renderPageCount(pg_count, this.page_info, page)}
        {this.renderImg(page['img'])}
        {this.renderParagraphs(page['paragraphs'])}
      </div>
    }
  }

  /**
   * Turn parsed TEI-style text into JSX.Element
   */
  private renderText(): JSX.Element {
    let parsed_tei = parseTEI(this.text)
    this.page_info = parsed_tei
    return this.renderPages()
  }

  /**
   * Render controls for ReadAlong
   */
  private renderControlPanel(): JSX.Element {
    return <div class={"control-panel theme--" + this.theme + " background--" + this.theme}>
      <div class="control-panel__buttons--left">
        <button onClick={() => { this.playing ? this.pause() : this.play() }} class={"control-panel__control ripple theme--" + this.theme + " background--" + this.theme}>
          <i class="material-icons">{this.playing ? 'pause' : 'play_arrow'}</i>
        </button>
        <button onClick={() => this.goBack(5)} class={"control-panel__control ripple theme--" + this.theme + " background--" + this.theme}>
          <i class="material-icons">replay_5</i>
        </button>
        <button onClick={() => this.stop()} class={"control-panel__control ripple theme--" + this.theme + " background--" + this.theme}>
          <i class="material-icons">stop</i>
        </button>
      </div>

      <div class="control-panel__buttons--center">
        <div>
          <h5 class={"control-panel__buttons__header color--" + this.theme}>{this.returnTranslation('speed', this.language)}</h5>
          <input type="range" min="75" max="125" value={this.playback_rate * 100} class="slider control-panel__control" id="myRange" onInput={(v) => this.changePlayback(v)} />
        </div>
      </div>

      <div class="control-panel__buttons--right">
        <button onClick={() => this.changeTheme()} class={"control-panel__control ripple theme--" + this.theme + " background--" + this.theme}>
          <i class="material-icons-outlined">style</i>
        </button>
        <button onClick={() => this.toggleFullscreen()} class={"control-panel__control ripple theme--" + this.theme + " background--" + this.theme}>
          <i class="material-icons">{this.fullscreen ? 'fullscreen_exit' : 'fullscreen'}</i>
        </button>
      </div>

    </div>
  }

  /**
   * Render main component
   */
  render(): JSX.Element {
    return (
      <div id='read-along-container' class='read-along-container'>
        <h1 class="slot__header">
          <slot name="read-along-header" />
        </h1>
        <h3 class="slot__subheader">
          <slot name="read-along-subheader" />
        </h3>
        <div class={"page__container theme--" + this.theme}>
          {/* <div class={'animate-transition theme--' + this.theme}> */}
          {this.renderGuide()}
          {this.renderText()}
          {/* </div> */}

        </div>
        <div onClick={(e) => this.goToSeekFromProgress(e)} id='all' class={"overlay__container theme--" + this.theme + " background--" + this.theme}>
          {this.renderOverlay()}
        </div>
        {this.renderControlPanel()}

      </div >
    )
  }
}
