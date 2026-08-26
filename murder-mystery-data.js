// Generated from ope-murder-mystery/server.js by scripts/sync-murder-mystery-data.mjs.
export const mysteryGame = {
  "title": "OPE! Murder Mystery: A Killer Halloween",
  "subtitle": "A two-hour Halloween crime hunt across On Par Entertainment",
  "joinPath": "/",
  "venue": {
    "name": "On Par Entertainment",
    "planLabel": "Guest clue route based on the December 2025 venue 360 tour",
    "planNote": "Schematic only. Keep every station in public space and verify the final mounting point during the event-day walk-through.",
    "courses": [
      {
        "name": "Wild Axe",
        "holes": 9
      },
      {
        "name": "Great Escape",
        "holes": 9
      },
      {
        "name": "Level Up",
        "holes": 9
      }
    ],
    "routePattern": {
      "scarlet": "Act I: 1 then 2. Act II: 4 then 3. Act III: 5 then 6. Act IV: 7.",
      "ivory": "Act I: 2 then 1. Act II: 3 then 4. Act III: 6 then 5. Act IV: 7."
    }
  },
  "truth": {
    "culprit": "lou-ledger",
    "weapon": "golden-putter",
    "motive": "charity-skimming",
    "evidence": "voucher-stub"
  },
  "options": {
    "weapons": [
      [
        "golden-putter",
        "The weighted Golden Putter trophy"
      ],
      [
        "bar-spoon",
        "A silver candlestick from the haunted welcome table"
      ],
      [
        "cart-battery",
        "A brass clasp from the costume trunk"
      ],
      [
        "scoreboard-hook",
        "A hook from the haunted photo backdrop"
      ]
    ],
    "motives": [
      [
        "charity-skimming",
        "Cover up money stolen from the Halloween fundraiser"
      ],
      [
        "jealous-sponsor",
        "Steal the spotlight from a rival costume sponsor"
      ],
      [
        "bad-review",
        "Stop damaging event footage from going public"
      ],
      [
        "fired-staff",
        "Revenge for being removed from A Killer Halloween"
      ]
    ],
    "evidence": [
      [
        "voucher-stub",
        "Voucher 413 with a copied approval mark and gold flecks"
      ],
      [
        "napkin-map",
        "Napkin map with a route to Wild Axe Hole 7"
      ],
      [
        "cart-key",
        "Golf cart key found near the service door"
      ],
      [
        "scorecard",
        "Scorecard with a suspicious overwritten time"
      ]
    ]
  },
  "acts": [
    {
      "id": 0,
      "title": "The Invitation: Enter at Your Own Risk",
      "duration": 10,
      "hostPrompt": "Welcome guests to On Par's Halloween fundraiser, assign routes, form detective teams, and play the opening film.",
      "liveAction": "Guests enter the costume party, choose a detective name, and learn that every posted QR chapter contains only part of the truth."
    },
    {
      "id": 1,
      "title": "Act I: Blackout at Wild Axe",
      "duration": 25,
      "hostPrompt": "Release the Wild Axe crime scene and hidden service-route QR chapters.",
      "liveAction": "Teams reconstruct two approaches to Hole 7 and test the seven-minute route while costumes make every witness harder to identify."
    },
    {
      "id": 2,
      "title": "Act II: Costumes and Cover Stories",
      "duration": 25,
      "hostPrompt": "Release the altered guest ledger and Golden Putter display chapters.",
      "liveAction": "Teams separate costume-party secrets from murder evidence and decide which statements are lies."
    },
    {
      "id": 3,
      "title": "Act III: The Haunted Ledger",
      "duration": 25,
      "hostPrompt": "Release Rex's cocktail-napkin route and Voucher 413 chapters.",
      "liveAction": "Teams walk the public route, reclassify an apparent getaway map, and follow the duplicated charity payout."
    },
    {
      "id": 4,
      "title": "Act IV: The Final Fright",
      "duration": 20,
      "hostPrompt": "Release Nina's restored Halloween clip and open the final accusation forms.",
      "liveAction": "Teams connect the green bag, credential gap, brass key, gold transfer, and forged payout before naming the killer."
    },
    {
      "id": 5,
      "title": "The Killer Reveal",
      "duration": 15,
      "hostPrompt": "Call the room together, reveal the solution, read top accusations, and announce the winning detectives.",
      "liveAction": "Play or read the solution, announce winners, take team photos, and award the night's prizes."
    }
  ],
  "suspects": [
    {
      "id": "bev-banner",
      "name": "Bev Banner",
      "role": "Costume party producer - tarot reader",
      "publicAlibi": "She says the raffle ledger proves she was greeting guests at 7:40 PM.",
      "interview": "Her recorded statement turns defensive whenever the ink and timestamp are compared.",
      "secret": "Bev changed 7:30 to 7:40 to hide an unauthorized raffle entry for a favored guest, but she did not kill Rex."
    },
    {
      "id": "marty-marsh",
      "name": "Marty Marsh",
      "role": "Mini-golf operations manager - carnival barker",
      "publicAlibi": "He claims he was counting equipment when the Golden Putter display looked wrong.",
      "interview": "His recorded account admits the display key left his control for 'insurance photographs.'",
      "secret": "Marty lent Lou the display key off the record, then blurred the checkout mark to protect his job."
    },
    {
      "id": "nina-niblick",
      "name": "Nina Niblick",
      "role": "Event photographer - emerald witch",
      "publicAlibi": "She was recording costume reactions near the self-pour wall.",
      "interview": "Her recorded statement admits she deleted a clip because she had used a staff-only camera angle.",
      "secret": "The restored clip caught a green ledger bag and hidden lanyard, but not the person's face."
    },
    {
      "id": "cal-cartwright",
      "name": "Cal Cartwright",
      "role": "Facilities lead - gravekeeper",
      "publicAlibi": "He was checking a breaker alert when the lights flickered.",
      "interview": "His maintenance record explains the public route but leaves Cart 2's driver blank.",
      "secret": "Cal had postponed a repair and feared blame for the outage, but the timed interruption was not his doing."
    },
    {
      "id": "tessa-tee",
      "name": "Tessa Tee",
      "role": "Vocalist and emcee - black widow",
      "publicAlibi": "She was preparing the Birdie Blue toast beside the Halloween stage.",
      "interview": "Her recorded account places Bev at check-in at 7:30, not at the altered 7:40 time.",
      "secret": "Tessa argued with Rex over a sponsor complaint, then saw an office-dressed figure return without a lanyard."
    },
    {
      "id": "lou-ledger",
      "name": "Lou Ledger",
      "role": "Fundraiser accountant - the phantom",
      "publicAlibi": "He insists he remained in the back office balancing the charity books.",
      "interview": "His recorded statement calls Voucher 413 a printing error and the green leather ledger bag shared property.",
      "secret": "Lou killed Rex after Rex discovered copied approvals and fake charity payouts."
    }
  ],
  "clues": [
    {
      "id": "scene-photo",
      "act": 1,
      "code": "TEEBOX",
      "title": "The Wild Axe Crime Scene",
      "type": "Scene",
      "points": 5,
      "text": "Rex Mulligan was found beside Wild Axe Hole 7 after A Killer Halloween went dark. His earlier scores are in pencil, but 7:42 PM is written in darker ink. A gold smear crosses the low rail, and the dropped pencil lies too far from the card to make the timestamp feel natural. A black feather nearby matches dozens used in the raven decor, so it cannot identify one costume.",
      "action": "From the public area, trace the normal guest approach and the quieter service-side approach. Decide whether 7:42 records an event or stages one.",
      "connection": "Pair this with the Service Door Log. The scene supplies two paths; the log tests whether either path fits the time window."
    },
    {
      "id": "cart-log",
      "act": 1,
      "code": "CART7",
      "title": "The Back-Corridor Ledger",
      "type": "Timeline",
      "points": 5,
      "text": "The service ledger records a door opening at 7:39 PM and again at 7:46 PM. The scan came from OFFICE-2, a spare gala-committee credential. Cart 2 was reserved earlier, but its driver line is blank. One person who claimed to stay with the books cannot account for that seven-minute gap.",
      "action": "Remain in guest-accessible space and estimate whether seven minutes is enough to reach Wild Axe Hole 7 and return.",
      "connection": "Cross-check the badge gap against every office-based alibi. A shared badge creates opportunity, not identity."
    },
    {
      "id": "altered-scorecard",
      "act": 2,
      "code": "SCORECARD",
      "title": "Altered Guest Ledger",
      "type": "Evidence",
      "points": 10,
      "text": "Bev's costume check-in ledger appears to place her at the welcome table at 7:40 PM. Under angled light, the four is pressed over a three. Tessa remembers seeing Bev there at 7:30. Bev admits changing the time to conceal an unauthorized raffle entry.",
      "action": "Classify this as murder evidence, an unrelated secret, or both. Then compare it with the separate 7:42 mark at the scene.",
      "connection": "Two altered times do not automatically mean two conspirators. Decide which lie changes the murder window and which only changes a reputation."
    },
    {
      "id": "locker-key",
      "act": 2,
      "code": "LOCKER",
      "title": "The Brass Display Key",
      "type": "Object",
      "points": 10,
      "text": "Marty admits the brass key to the Golden Putter display was borrowed for 'insurance photographs.' The checkout mark reads L/M, but it could be initials or location shorthand. Dark-green leather dye marks the case hinge, and the trophy's weighted base can explain the low gold transfer at Wild Axe Hole 7.",
      "action": "Inspect the prop display without touching it. List who had access, then identify what would turn access into proof of use.",
      "connection": "The key explains how the object left its case. Voucher 413 and the final clip must explain where it went next."
    },
    {
      "id": "napkin-map",
      "act": 3,
      "code": "NAPKIN",
      "title": "The Cocktail-Napkin Map",
      "type": "Puzzle",
      "points": 15,
      "text": "A cocktail napkin marks the back office, prize display, service corridor, and Wild Axe Hole 7. Its tiny backward seven and pencil pressure match Rex's scorecard. Nina says Rex had asked about camera blind spots before the midnight toast. The apparent getaway map may actually document the victim's investigation.",
      "action": "Walk only the guest-accessible version of the route. Decide which stop Rex was trying to connect to the missing money.",
      "connection": "Reclassify the map before using it. If Rex drew it, the route points toward what he discovered rather than how his killer escaped."
    },
    {
      "id": "voucher-stub",
      "act": 3,
      "code": "RECEIPT",
      "title": "Voucher Stub 413",
      "type": "Money Trail",
      "points": 15,
      "text": "Voucher 413 carries what looks like an L.L. approval, but magnification shows an exact carbon copy of the mark on Voucher 347, including the same broken loop. Its payee does not exist. The paper matches the fundraiser forms kept in the green leather ledger bag, and fresh gold flecks sit inside the torn edge.",
      "action": "Explain why a duplicated approval is stronger than initials alone. Then identify who controlled the original voucher stack.",
      "connection": "This clue joins motive to the object: forged payouts explain why Rex was silenced, while fresh gold transfer places the paper near the missing trophy."
    },
    {
      "id": "video-still",
      "act": 4,
      "code": "GREENBAG",
      "title": "The Restored Halloween Clip",
      "type": "Final Clue",
      "points": 20,
      "text": "Nina's restored 7:45 PM clip catches a black-costumed figure crossing toward the service door with the green leather ledger bag. The face is obscured. A gold handle is visible, and an event credential has been tucked inside. Several guests wore black capes and masks; the bag checkout record is what shows Lou signed for it at 6:10 PM and never returned it.",
      "action": "Use the clip only after matching it to the badge gap, copied voucher, borrowed key, route, and gold transfer.",
      "connection": "The video narrows possession, but the full solution still requires means, motive, and opportunity from earlier chapters."
    }
  ],
  "missions": [
    {
      "id": "midwest-manners",
      "act": 1,
      "title": "Reconstruct the Blackout",
      "points": 10,
      "prompt": "Submit a short scene reconstruction naming both approaches to Wild Axe Hole 7 and whether the 7:42 timestamp looks observed or staged."
    },
    {
      "id": "alibi-grid",
      "act": 2,
      "title": "Costumes and Cover Stories",
      "points": 15,
      "prompt": "Compare two suspect records. Submit one lie tied to the murder window and one unrelated secret that could mislead investigators."
    },
    {
      "id": "rumor-barter",
      "act": 3,
      "title": "Follow the Haunted Ledger",
      "points": 15,
      "prompt": "Walk the public version of Rex's route. Submit why the map changes meaning if the victim drew it instead of the killer."
    },
    {
      "id": "closing-argument",
      "act": 4,
      "title": "Name the Killer",
      "points": 20,
      "prompt": "Write a 30-second closing argument citing at least three paired clues, not one suspicious object or set of initials."
    }
  ],
  "stations": [
    {
      "id": "hole-13",
      "stop": 1,
      "act": 1,
      "clueCode": "TEEBOX",
      "title": "Blackout at Wild Axe Hole 7",
      "type": "Crime Scene Chapter",
      "routeLabel": "Blackout - Scarlet starts here",
      "tourAnchor": "Wild Axe public rail",
      "location": "Post at the guest-side black rail under the Wild Axe signage, nearest the staged Hole 7 marker. Use a freestanding sign outside every axe and putting lane.",
      "guestLocation": "Wild Axe public rail, beside the staged Hole 7 marker.",
      "wayfinding": "From mini-golf check-in, follow the illuminated trees toward the Wild Axe signage. Stop at the public rail.",
      "placement": "Set the crime-scene marker and QR card on the guest side of the rail so a full team can gather without entering a lane.",
      "safety": "Never place the card inside an axe-throwing lane, on an active putting surface, or where it narrows the course entrance.",
      "prompt": "Watch the Halloween scene, then decide whether the timestamp records the crime or stages it.",
      "scene": "The music stops and the lights return at Wild Axe Hole 7. Rex's scorecard, a distant pencil, a loose raven feather, and a low gold smear remain; the victim is never shown graphically.",
      "interviewLabel": "Crime Scene Reconstruction",
      "interview": "The 7:42 mark is darker than the earlier scores. Investigators found no sign that Rex wrote after the interruption.",
      "task": "From guest-accessible space, point out the normal entrance and the quieter service-side approach.",
      "connect": "Decide what the ink, pencil placement, and gold smear prove separately before combining them.",
      "hints": [
        "Compare the darker time mark with where the dropped pencil was found.",
        "A time written on a scorecard is not automatically the time an event occurred.",
        "Treat 7:42 as possibly staged, then test it against the separate 7:39 and 7:46 door events."
      ],
      "media": {
        "src": "/assets/videos/hole-13-crime-scene.webm?cut=killer-halloween-v5",
        "poster": "/assets/on-par-scenes-halloween/wild-axe-rex-shadow.png",
        "caption": "Chapter 1: Rex hosts A Killer Halloween, six costumed suspects cross his path, and the Wild Axe scene is reconstructed without graphic imagery."
      }
    },
    {
      "id": "service-door",
      "stop": 2,
      "act": 1,
      "clueCode": "CART7",
      "title": "The Back-Corridor Ledger",
      "type": "Hidden Route Chapter",
      "routeLabel": "Blackout - Ivory starts here",
      "tourAnchor": "Shuffleboard end cap",
      "location": "Post at the shuffleboard end cap facing the green-wall corridor near the restrooms. Keep the freestanding sign at least six feet from every door.",
      "guestLocation": "Shuffleboard end cap by the green-wall corridor, public side only.",
      "wayfinding": "From the central floor, follow the shuffleboard tables toward the green wall and stop at the public table end.",
      "placement": "Use floor tape beyond the QR card to represent the restricted service route. The real doors remain untouched.",
      "safety": "Do not attach anything to a restroom, service, fire, or staff door. Guests complete the route estimate from public aisles only.",
      "prompt": "Study the badge gap. Opportunity belongs to a route before it belongs to a person.",
      "scene": "Cal discovers two door events, a blank cart driver line, and a seven-minute window through the back corridor that bypasses the Halloween crowd.",
      "interviewLabel": "Cal Cartwright - Facilities Statement",
      "interview": "The scan belongs to OFFICE-2, not to me. It is a spare committee badge. I logged the alert after the lights dipped.",
      "task": "Stay in public areas and estimate the round trip to Wild Axe Hole 7. Do not enter staff-only space.",
      "connect": "Decide whether the log identifies a person, creates a route, or does both. Defend only what the record supports.",
      "hints": [
        "The badge belongs to a committee role, not automatically to one named suspect.",
        "Ask which office-only alibi becomes possible to challenge if someone could leave and return in seven minutes.",
        "Use the route as opportunity evidence. Identity comes later from possession records and the restored clip."
      ],
      "media": {
        "src": "/assets/videos/service-door-log.webm?cut=killer-halloween-v5",
        "poster": "/assets/on-par-scenes-halloween/service-route-cal-lou.png",
        "caption": "Chapter 2: Cal encounters a black-costumed figure along On Par's back corridor during the OFFICE-2 credential gap."
      }
    },
    {
      "id": "scorecard-table",
      "stop": 3,
      "act": 2,
      "clueCode": "SCORECARD",
      "title": "The Altered Guest Ledger",
      "type": "Alibi Chapter",
      "routeLabel": "Costume Secrets - Ivory starts here",
      "tourAnchor": "Mini-golf pencil return",
      "location": "Post beside the mini-golf pencil-return and club rack on a separate tabletop easel facing the open floor. Keep all equipment access clear.",
      "guestLocation": "Mini-golf check-in, beside the pencil-return and club rack.",
      "wayfinding": "Look for the RETURN MINI-GOLF PENCILS HERE sign and the rows of putters on the central floor.",
      "placement": "Stage the altered scorecard and angled inspection light on a narrow event table beside, not on, the equipment return.",
      "safety": "Do not cover operational signage, touch rental equipment, or create a queue across the main aisle.",
      "prompt": "One costume-party secret is real. The harder question is whether it belongs to the murder.",
      "scene": "Bev's Halloween check-in ledger appears to provide a 7:40 alibi until Tessa's account and the pressure marks expose an overwritten digit.",
      "interviewLabel": "Bev Banner - Tarot Host's Statement",
      "interview": "I changed 7:30 to 7:40. It hid a raffle entry that should never have been there. It did not put me near Wild Axe.",
      "task": "Classify Bev's lie as murder evidence, an unrelated secret, or both. Defend the choice.",
      "connect": "Decide which false time changes the murder window and which false time only protects a reputation.",
      "hints": [
        "A proven lie may protect something embarrassing without protecting a killer.",
        "Ask what changing 7:30 to 7:40 actually changes about Bev's location.",
        "Bev's alteration is a red herring. The darker 7:42 at Wild Axe affects the murder timeline in a different way."
      ],
      "media": {
        "src": "/assets/videos/altered-scorecard.webm?cut=killer-halloween-v5",
        "poster": "/assets/on-par-scenes-halloween/altered-alibi-bev-tessa-lou.png",
        "caption": "Chapter 3: Bev, Tessa, and Lou play out a costume check-in dispute surrounding the altered 7:40 entry."
      }
    },
    {
      "id": "trophy-case",
      "stop": 4,
      "act": 2,
      "clueCode": "LOCKER",
      "title": "The Golden Putter Display",
      "type": "Locked Object Chapter",
      "routeLabel": "Costume Secrets - Scarlet starts here",
      "tourAnchor": "Great Escape Egyptian entry",
      "location": "Post at the Great Escape Egyptian-column entrance. Stage the locked Golden Putter case on the guest side of the rail, outside the course path.",
      "guestLocation": "Great Escape entrance, beside the Egyptian columns and staged trophy case.",
      "wayfinding": "From the bar and central floor, follow the Egyptian columns and sarcophagus landmark to the Great Escape entry rail.",
      "placement": "Use a stable, locked acrylic case or tethered display on a narrow event table with the QR card facing the public aisle.",
      "safety": "Guests inspect without touching. Keep the display outside all nine putting holes and clear of the entry rail opening.",
      "prompt": "Inspect access, transfer, and weight. A borrowed key is a beginning, not a conclusion.",
      "scene": "Marty recounts lending the display key off the record while the case hinge reveals a trace of dark-green leather dye.",
      "interviewLabel": "Marty Marsh - Operations Statement",
      "interview": "They said the key was for insurance photographs. I blurred the checkout mark because I knew I had broken procedure.",
      "task": "Inspect the display without touching it. Name what would convert access to the trophy into proof it was carried away.",
      "connect": "Separate access, weapon suitability, and possession. They are three different claims and need different support.",
      "hints": [
        "Access to the display proves opportunity to take the object, not who carried it.",
        "Look for something later that could pick up dark-green dye and hold a gold object at the same time.",
        "The green ledger bag and the gold flecks on Voucher 413 will turn access into a stronger possession chain."
      ],
      "media": {
        "src": "/assets/videos/golden-putter-weapons.webm?cut=killer-halloween-v5",
        "poster": "/assets/on-par-scenes-halloween/golden-putter-marty-lou.png",
        "caption": "Chapter 4: Marty opens the Halloween prize display and passes its brass key to an unlogged borrower."
      }
    },
    {
      "id": "napkin-map",
      "stop": 5,
      "act": 3,
      "clueCode": "NAPKIN",
      "title": "The Cocktail-Napkin Map",
      "type": "Route Puzzle Chapter",
      "routeLabel": "Haunted Ledger - Scarlet starts here",
      "tourAnchor": "Level Up overlook",
      "location": "Post at the public Level Up overlook beside its sign and red game-machine landmark. Use a freestanding rail sign outside the putting lanes.",
      "guestLocation": "Level Up public overlook, beside the course sign and red game landmark.",
      "wayfinding": "From Great Escape, cross the public mini-golf overlook toward the LEVEL UP sign visible near the red game feature.",
      "placement": "Mount the napkin reproduction at comfortable reading height with the QR code below it and room for a team to step aside.",
      "safety": "Do not attach the card to course scenery or place it where guests must step onto any of Level Up's nine holes.",
      "prompt": "Before calling this a getaway map, ask who drew it and why.",
      "scene": "A cocktail-napkin route appears to map a getaway until Rex's handwriting and Nina's earlier conversation reverse its meaning.",
      "interviewLabel": "Nina Niblick - Earlier Event Clip",
      "interview": "Rex asked me where the cameras could not see. He said the missing money moved through the room before it left the books.",
      "task": "Walk only the guest-accessible version of Rex's route and choose the stop he was trying to verify.",
      "connect": "Identify the mapmaker before assigning intent to the route. The same path can tell two opposite stories.",
      "hints": [
        "Identify the handwriting before deciding whose movements the route represents.",
        "A map drawn by the victim can document an investigation instead of an escape.",
        "Rex was connecting the office records, Great Escape trophy display, and Wild Axe scene before he died."
      ],
      "media": {
        "src": "/assets/videos/napkin-map-route.webm?cut=killer-halloween-v5",
        "poster": "/assets/on-par-scenes-halloween/rex-route-level-up.png",
        "caption": "Chapter 5: Rex and Nina retrace a back-office-to-prize-display investigation through A Killer Halloween."
      }
    },
    {
      "id": "voucher-413",
      "stop": 6,
      "act": 3,
      "clueCode": "RECEIPT",
      "title": "Carbon Copy Voucher 413",
      "type": "Money Trail Chapter",
      "routeLabel": "Haunted Ledger - Ivory starts here",
      "tourAnchor": "Darts lounge booth end",
      "location": "Post at the darts lounge booth end beside the knight and digital dart-lane wall. Use a dedicated evidence table away from POS stations and real records.",
      "guestLocation": "Darts lounge, at the booth end beside the knight and digital dart lanes.",
      "wayfinding": "From the entrance logo wall, turn into the wood-paneled darts lounge and look for the knight and numbered dart lanes.",
      "placement": "Stage only replica Vouchers 347 and 413, a magnifier, and the QR card on a reserved event table at the booth end.",
      "safety": "Keep the table outside every throwing line and never place actual receipts, payment records, or guest information in the display.",
      "prompt": "Ignore the initials first. Study what a legitimate signature should never repeat exactly.",
      "scene": "Voucher 413 is compared with Voucher 347. The two approvals share the same broken loop, revealing a copied mark rather than two signatures.",
      "interviewLabel": "Lou Ledger - Bookkeeper's Statement",
      "interview": "A duplicated mark can be a printer fault. The payee file was still being reconciled. Rex misunderstood an unfinished ledger.",
      "task": "Explain why the copied approval, nonexistent payee, paper stock, and fresh gold flecks matter together.",
      "connect": "Build one explanation for the copied mark, fake payee, matching paper, and gold flecks without relying on initials alone.",
      "hints": [
        "Initials can match by coincidence. Repeated defects are much harder to explain.",
        "Two genuine signatures do not reproduce the exact same broken loop and spacing.",
        "The copied approval and fake payee establish the money motive; the fresh gold flecks connect the voucher to the missing trophy."
      ],
      "media": {
        "src": "/assets/videos/voucher-413-evidence.webm?cut=killer-halloween-v5",
        "poster": "/assets/on-par-scenes-halloween/voucher-413-lou-bev.png",
        "caption": "Chapter 6: Rex confronts Lou over the Halloween fundraiser ledger before Voucher 413 is examined."
      }
    },
    {
      "id": "green-bag",
      "stop": 7,
      "act": 4,
      "clueCode": "GREENBAG",
      "title": "The Restored Halloween Clip",
      "type": "Final Fright Chapter",
      "routeLabel": "Final Fright - all teams finish here",
      "tourAnchor": "Central wave-mural lounge",
      "location": "Post at the central wave-mural lounge with the TV and couches. Place a freestanding final station beside the lounge while keeping the main aisle open.",
      "guestLocation": "Central wave-mural lounge, beside the TV and couches.",
      "wayfinding": "Return to the central floor and look for the blue wave mural, mounted TV, couches, and long game table.",
      "placement": "Set the green ledger bag prop and final QR card beside the lounge. Use the nearby screen for the reveal if the event layout permits.",
      "safety": "Leave the central aisle, couch access, and emergency paths fully open while teams gather for accusations.",
      "prompt": "This clip narrows possession. It does not replace the rest of your case.",
      "scene": "Nina restores a deleted angle from 7:45. A black-costumed figure, green leather ledger bag, hidden event credential, and gold handle cross toward the back corridor.",
      "interviewLabel": "Nina Niblick - Restored Halloween Clip",
      "interview": "I deleted it because I should not have filmed that angle. The face is missing, but the bag checkout record is not.",
      "task": "Build a four-part chain: who possessed the bag, who had opportunity, why Rex was targeted, and how the trophy moved.",
      "connect": "Build a single chain for possession, opportunity, motive, and transfer. Any suspect who misses one category remains incomplete.",
      "hints": [
        "The face is missing, so identify the objects by records rather than by appearance.",
        "Which suspect signed for the bag and also claimed never to leave the office?",
        "Lou is linked to the bag checkout, voucher originals, broken office alibi, and borrowed display key. The complete chain identifies him."
      ],
      "media": {
        "src": "/assets/videos/final-green-bag.webm?cut=killer-halloween-v5",
        "poster": "/assets/on-par-scenes-halloween/final-nina-green-bag.png",
        "caption": "Chapter 7: Nina films a black-costumed figure carrying the green leather bag through A Killer Halloween at 7:45."
      }
    }
  ]
};
