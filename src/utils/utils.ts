import { Howl } from 'howler';
import { Subject } from 'rxjs';

/**
 * Gets XML from path
 * @param {string} path - the path to the xml file
 */
function getXML(path: string): string {
  let xmlhttp = new XMLHttpRequest();
  xmlhttp.open("GET", path, false);
  xmlhttp.send();
  return xmlhttp.responseText;
}

/**
 * Return list of elements from XPath
 * @param {string} xpath - the xpath to evaluate with
 * @param {Document} xml - the xml to evaluate
 */
function getElementByXpath(xpath: string, xml: Document): Node[] {
  let result_container: Node[] = []
  let results = xml.evaluate(xpath, xml, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
  let node = results.iterateNext();
  while (node) {
    result_container.push(node);
    node = results.iterateNext()
  }
  return result_container
}


/**
 * Return a zipped array of arrays
 * @param {array[]}
 */
export function zip(arrays): Array<any[]> {
  return arrays[0].map(function (_, i) {
    return arrays.map(function (array) { return array[i] })
  });
}

/**
 * Return useful data from TEI xml file
 * @param {string} - the path to the TEI file
 */
export function parseTEI(path: string): Array<string[]> {
  let xmlDocument = getXML(path)
  let parser = new DOMParser();
  let xml_text = parser.parseFromString(xmlDocument, "text/xml")
  let word_ids = getElementByXpath('/document/s/w/@id', xml_text).map(x => "s2.xml#" + x['value'])
  let word_vals = getElementByXpath('document/s/w', xml_text).map(x => x['innerHTML'])
  let result = zip([word_ids, word_vals])
  return result
}

/**
 * Return useful data from SMIL xml file
 * @param {string} - the path to the SMIL file
 */
export function parseSMIL(path: string): object {
  let xmlDocument = getXML(path)
  let parser = new DOMParser();
  let xml_text = parser.parseFromString(xmlDocument, "text/xml")
  let text = getElementByXpath('/smil/body/par/text/@src', xml_text).map(x => x['value'])
  let audio_begin = getElementByXpath('/smil/body/par/audio/@clipBegin', xml_text).map(x => x['value'] * 1000)
  let audio_end = getElementByXpath('/smil/body/par/audio/@clipEnd', xml_text).map(x => x['value'] * 1000)
  let audio_duration = []
  for (var i = 0; i < audio_begin.length; i++) {
    let duration = audio_end[i] - audio_begin[i]
    audio_duration.push(duration)
  }
  let audio = zip([audio_begin, audio_duration])
  let result = {}
  for (var i = 0; i < text.length; i++) {
    result[text[i]] = audio[i]
  }
  return result
}

/**
 * Sprite class containing the state of our sprites to play and their progress.
 * @param {Object} options Settings to pass into and setup the sound and visuals.
 */
export var Sprite = function (options) {
  var self = this;

  self.sounds = [];
  // Setup the options to define this sprite display.
  self._sprite = options.sprite;
  // Create new Subject tracking which element is being read
  self._reading$ = new Subject;
  // List of all non-"all" sprites 
  self._tinySprite = Object.keys(options.sprite).map((str) => [self._sprite[str][0], str]);
  // remove the 'all' sprite
  self._tinySprite.pop()

  // Create our audio sprite definition.
  self.sound = new Howl({
    src: options.src,
    sprite: options.sprite,
    rate: options.rate
  });

  // Begin the progress step tick.
  requestAnimationFrame(self.step.bind(self));
};

Sprite.prototype = {
  /**
   * Play a sprite when clicked and track the progress.
   * @param  {String} key Key in the sprite map object.
   */
  play: function (key): number {
    var self = this;
    self._spriteLeft = self._tinySprite
    var sprite = key;
    // Play the sprite sound and capture the ID.
    var id = self.sound.play(sprite);
    return id
  },

  pause: function (): number {
    var self = this;
    self.sound.pause()
    return self.sound.id
  },

  /**
   * Go back s seconds, or if current position - s is less than 0
   * go back to the beginning.
   * 
   * @param id: number - the id of the audio to roll back
   * @param s: number - the number of seconds to go back
   */
  goBack: function (id, s): number {
    var self = this;
    // reset sprites left
    self._spriteLeft = self._tinySprite
    // if current_seek - s is greater than 0, find the closest sprite
    // and highlight it; seek to current_seek -s.
    if (self.sound.seek(id = id) - s > 0) {
      var id = self.sound.seek(self.sound.seek(id = id) - s, id);
      // move highlight back TODO: refactor out into its own function and combine with version in step()
      var seek = self.sound.seek(id = id)
      for (var j = 0; j < self._spriteLeft.length; j++) {
        // if seek passes sprite start point, replace self._reading with that sprite and slice the array of sprites left
        if (seek * 1000 >= self._spriteLeft[j][0]) {
          self._reading$.next(self._spriteLeft[j][1])
          self._spriteLeft = self._spriteLeft.slice(j, self._spriteLeft.length)
        }
      }
      // else, return back to beginning
    } else {
      var id = self.sound.seek(0, id);
      self._reading$.next(self._spriteLeft[0][1])
    }

    return id


  },

  /**
   * Stop the sound
   */
  stop: function (): number {
    var self = this;
    // remove reading
    self._reading$.next('')
    // Play the sprite sound and capture the ID.
    var id = self.sound.stop();
    return id
  },

  /**
   * The step called within requestAnimationFrame to update the playback positions.
   */
  step: function (): void {
    var self = this;
    // Loop through all active sounds and update their progress bar.
    for (var i = 0; i < self.sounds.length; i++) {
      var id = parseInt(self.sounds[i].id, 10);
      var offset = self._sprite[self.sounds[i].dataset.sprite][0];
      var seek = (self.sound.seek(id) || 0) - (offset / 1000);
      for (var j = 0; j < self._spriteLeft.length; j++) { // TODO: refactor out into its own function and combine with version in step()
        // if stopped
        if (seek > 0) {
          // if seek passes sprite start point, replace self._reading with that sprite and slice the array of sprites left
          if (seek * 1000 >= self._spriteLeft[j][0]) {
            self._reading$.next(self._spriteLeft[j][1])
            self._spriteLeft = self._spriteLeft.slice(j, self._spriteLeft.length)
          }
        }
      }
      self.sounds[i].style.width = (((seek / self.sound.duration(id)) * 100) || 0) + '%';
    }
    requestAnimationFrame(self.step.bind(self));
  }
};
