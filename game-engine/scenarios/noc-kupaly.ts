/**
 * Scenariusz "Noc Kupaly" — 7-encounterowy tutorial campaign.
 * Pelna narracja, prebuilt deck, specjalne zasady.
 */

import type { ScenarioDefinition, TriggerRule } from './types'

export const NOC_KUPALY: ScenarioDefinition = {
  id: 'noc_kupaly',
  title: 'Noc Kupaly',

  // ===== PROLOG =====
  prologNarrative: [
    { text: 'Mokrzany swietuja. Ogniska buchaja nad Mokra, iskry leca w niebo jak swietojańskie robaczki odwrocone do gory nogami. Dziewczeta puszczaja wianki, chlopcy skacza przez ogień, starzy siedza na lawach i pija piwo.', style: 'italic' },
    { text: 'Ale nie wszyscy swietuja.', style: 'italic' },
    { text: 'W chacie Sieciecha jest ciemno i cicho. Jas — szesc lat, jasne wlosy, piegi — lezy na lawie pod baranim kozuchem. Drobne cialo trzesie sie od goraczki. Zywia siedzi obok, gladzi go po czole.', style: 'italic' },
    { speaker: 'Zywia', text: 'Nie dam rady, Radku. Od wiosny probuje. Ziola, oklady, zaklecia — nic nie trzyma. To Dziewiatko go ugryzlo.' },
    { speaker: 'Radek', text: 'Dziewiatko?' },
    { speaker: 'Zywia', text: 'Owad. Malutki, zyje pod ziemia. Ugryzienie — i goraczka, ktora nie puszcza. Bez pomocy w kilka tygodni...' },
    { text: 'Nie konczy.', style: 'italic' },
    { speaker: 'Radek', text: 'Co moze pomoc?' },
    { speaker: 'Zywia', text: 'Kwiat Paproci. Zakwita raz w roku, w Noc Kupaly. Gdzies gleboko w puszczy, na polanie, ktorej nikt nie zna. Kto go znajdzie i oprze sie temu, co go streze — temu roslina da moc, by uleczyc kazda chorobe.' },
    { speaker: 'Radek', text: 'To ide.' },
    { speaker: 'Zywia', text: 'Las w Noc Kupaly nie jest zwyklym lasem. Duchy sa blizej, granica cieńsza. Nie pojdziesz sam.' },
    // Scena 2: Przy ognisku
    { text: 'Wychodza. Przy ognisku siedza ludzie. Naczelnik Mokrzan — stary Goscirad — pije miod z glinianego kubka. Obok niego Wolch Siemomysl, kaplan Welesa — jednooki, z laska z jarzebiny.', style: 'italic' },
    { text: 'Radek mowi, dokad idzie. Cisza.', style: 'italic' },
    { speaker: 'Goscirad', text: 'Kwiat Paproci. Moj dziad opowiadal, ze jego dziad probowal. Nie wrocil.' },
    { speaker: 'Radek', text: 'Musze sprobowac.' },
    { speaker: 'Goscirad', text: 'Wez ludzi. Wez tych, ktorym ufasz, i tych, ktorzy znaja las. Kto pojdzie z Radkiem?' },
    { text: 'Milosz wstaje pierwszy.', style: 'italic' },
    { speaker: 'Milosz', text: 'Obiecalem jego matce. Ide.' },
    { text: 'Bogna siedzi na uboczu, w cieniu. Nikt nie widzial, kiedy przyszla.', style: 'italic' },
    { speaker: 'Bogna', text: 'Potrzebujesz kogos, kto zna ciemna strone puszczy.' },
    { speaker: 'Radek', text: 'Dlaczego chcesz pomoc?' },
    { speaker: 'Bogna', text: 'Chce zobaczyc, czy kwiat naprawde istnieje.' },
    { text: 'Dobromir podchodzi niepewnie. Rece mu sie trzesa.', style: 'italic' },
    { speaker: 'Dobromir', text: 'Zywiu... powinienem isc. Gdyby ktos sie zranil...' },
    { speaker: 'Zywia', text: 'Tam nie wystarczy umiec. Trzeba wiedziec.' },
    { speaker: 'Dobromir', text: 'To mnie naucz po drodze.' },
    { text: 'Zywia patrzy na niego. Kiwa glowa.', style: 'italic' },
    { text: 'Stach dopija piwo.', style: 'italic' },
    { speaker: 'Stach', text: 'Ej, ej. A co — bez mnie? Gadali, ze nikt z Mokrzan nie ma jaj, zeby isc po kwiat. To im pokaze.' },
    { speaker: 'Milosz', text: 'Stach, ty do lasu po drewno boisz sie chodzic po zmroku.' },
    { speaker: 'Stach', text: 'Bo po zmroku w lesie SA rzeczy, ktorych sie trzeba bac. Ale skoro wy idioci idziecie — nie bede gorszy.' },
    // Scena 3: Blogoslawienstwo
    { text: 'Wolch Siemomysl podchodzi do Radka. Opiera sie na lasce. Jedyne oko patrzy przenikliwie.', style: 'italic' },
    { speaker: 'Wolch', text: 'Posluchaj, chlopcze. Las w Noc Kupaly nie jest twoim wrogiem. Ale nie jest tez przyjacielem. Jest... soba. Testuje. Duchy, ktore spotkasz — jedne beda cie straszyc, inne pomagac. Nie atakuj wszystkiego, co zobaczysz.' },
    { speaker: 'Radek', text: 'Skad bede wiedzial, co jest co?' },
    { speaker: 'Wolch', text: 'Nie bedziesz. Ale twoja szeptunka bedzie. Sluchaj Zywii.' },
    { text: 'Kladzie dlon na ramieniu Radka. Szepcze cos. Radek czuje cieplo.', style: 'italic' },
    { text: 'Wolch daje blogoslawienstwo — Radek zyskuje +1 do Ataku na caly scenariusz.', style: 'bold' },
    // Scena 4: Prog
    { text: 'Ida przez wies. Wychodza z wioski. Za plecami — ogniska. Przed nimi — rzeka, a za rzeka — sciana lasu. Czarna na tle nieba.', style: 'italic' },
    { speaker: 'Milosz', text: 'Wrocimy.' },
    { speaker: 'Radek', text: 'Wrocimy.' },
  ],

  // ===== PLAYER DECK =====
  playerDeck: {
    creatures: [
      { effectId: 'lucznik_pin', name: 'Radek' },          // #56 Lucznik
      { effectId: 'woj_mass_deploy', name: 'Milosz' },      // #50 Woj
      { effectId: 'woj_mass_deploy' },                       // #50 Woj (ludzie z wioski)
      { effectId: 'woj_mass_deploy' },                       // #50 Woj (ludzie z wioski)
      { effectId: 'szeptunka_damage_reduction', name: 'Zywia' }, // #48 Szeptunka
      { effectId: 'chlop_extra_attack', name: 'Stach' },    // #34 Chlop
      { effectId: 'chlop_extra_attack' },                    // #34 Chlop
      { effectId: 'baba_bonus_vs_type', name: 'Bogna' },    // #31 Baba
      { effectId: 'znachor_absorb', name: 'Dobromir' },     // #52 Znachor
    ],
    adventures: [
      'adventure_boskie_wsparcie',       // #38
      'adventure_przyjazn',              // #20
      'adventure_sledovik',              // #36
      'adventure_braterstwo_bogatyrow',  // #35
    ],
  },

  startingBuffs: [
    { effectId: 'lucznik_pin', stat: 'atk', value: 1 },  // Wolch: +1 ATK na Radka
  ],

  // ===== TRANSITION SCENES =====
  transitionScenes: [
    {
      // After encounter 3 (Lesnice i Jaroszek)
      afterEncounter: 3,
      narrative: [
        { text: 'Wychodza z geszczy. Las zmienia sie — drzewa wyzsze, starsze, cisza glebsza. Powietrze pachnie zywica i mokra ziemia.', style: 'italic' },
        { text: 'Radek zatrzymuje sie. Czuje, ze ktos patrzy.', style: 'italic' },
        { text: 'Miedzy drzewami — cos ogromnego. Wyglada jak stary dab. Ale deby nie oddychaja. I nie maja oczu — zielonych, glebokich, spokojnych.', style: 'italic' },
        { speaker: 'Zywia', text: 'Dobroochoczy. Straznik lasu. Stoi tu od setek lat.' },
        { speaker: 'Radek', text: 'Jest grozny?' },
        { speaker: 'Zywia', text: 'Dla zlych — tak. Dla dobrych — nie. Pokrzywdzonego ochrania. Na zlego sprowadza pomste. Ocenia nas.' },
        { speaker: 'Bogna', text: 'Nie klaniaj sie. Nie mow. Po prostu idz dalej ze spokojem. Pokazesz szacunek tym, ze nie probujesz z nim walczyc.' },
        { text: 'Druzyna przechodzi. Dobroochoczy stoi nieruchomo. Kiedy ostatni z nich mija go — Radek czuje na plecach cieplo. Jakby ktos polozyl mu dlon na ramieniu. Ale kiedy sie odwraca — jest tylko drzewo.', style: 'italic' },
      ],
    },
    {
      // After encounter 5 (Taniec Rusalek)
      afterEncounter: 5,
      narrative: [
        { text: 'Ida dalej. Las jest coraz gestszy, coraz ciemniejszy. Pochodnia ledwo swieci.', style: 'italic' },
        { text: 'Na sciezce stoi kobieta. Garbata, splatane wlosy, dlugie palce. Usmiecha sie — ale usmiech jest krzywy.', style: 'italic' },
        { speaker: 'Dziwożona', text: 'Dokad tak pedzicie?' },
        { speaker: 'Zywia', text: 'Nie twoja sprawa, Dziwozono.' },
        { speaker: 'Dziwożona', text: 'Kwiat? Szukasz kwiatu? Nie ma zadnego kwiatu, chlopcze. To bajka dla glupcow. Las sie z was smieje.' },
        { speaker: 'Radek', text: 'Idziemy dalej.' },
        { speaker: 'Dziwożona', text: 'A twoj braciszek? Ten maly? Goraczka, tak? Biedactwo. Moge go wyleczyc. Znam sposob. Nie trzeba kwiatu.' },
        { text: 'Cisza.', style: 'italic' },
        { speaker: 'Bogna', text: 'Znam cie, Dziwozono. Wiem, co zabierasz i co zostawiasz w zamian. Odejdz.' },
        { speaker: 'Dziwożona', text: 'Wiedzma. Zawsze psujecie zabawe.' },
        { text: 'Dziwożona cofa sie w ciemnosc. Nie walczy — nie tym razem. Ale jej smiech slychac jeszcze dlugo.', style: 'italic' },
        { speaker: 'Stach', text: 'Co ona miala na mysli? Ze wyleczy Jasia?' },
        { speaker: 'Bogna', text: 'Dziwożona kradnie dzieci z kolysek i zostawia swoje. To, co "leczy" — zamienia.' },
        { speaker: 'Stach', text: '...aha. Dobrze, ze nie poszedem.' },
      ],
    },
  ],

  // ===== 7 ENCOUNTERS =====
  encounters: [
    // =========================================
    // ENCOUNTER 1: BROD NA MOKREJ
    // =========================================
    {
      id: 'enc1_brod',
      title: 'Brod na Mokrej',
      teachMechanic: 'Wystawianie istot, atakowanie, zabijanie',
      narrativeIntro: [
        { text: 'Mokra za dnia jest spokojna i plytka. W Noc Kupaly — inna. Woda czarna, plynie bez szumu.', style: 'italic' },
        { text: 'Na kamieniu posrodku brodu siedzi ktos mokry, z wodorostami we wlosach.', style: 'italic' },
        { speaker: 'Zywia', text: 'Wodnik.' },
        { speaker: 'Stach', text: 'Ja go nie widze.' },
        { speaker: 'Bogna', text: 'Bo on ciebie widzi.' },
        { text: 'Wodnik podnosi glowe. Oczy jak dwa ksiezyce odbite w stawie.', style: 'italic' },
        { speaker: 'Wodnik', text: 'Idziecie. Bez podarunku. W moja noc.' },
        { speaker: 'Zywia', text: 'Chore dziecko, Wodniku. Dziewiatko go ugryzlo. Ide po kwiat.' },
        { speaker: 'Wodnik', text: 'Kazdy idzie z prosba. Nikt nie przychodzi z szacunkiem.' },
        { text: 'Zsuwa sie z kamienia. Z wody podnosi sie blady ksztalt — Utopiec. Z bagna wygrzbuje sie Bagiennik.', style: 'italic' },
        { speaker: 'Bogna', text: 'Utopiec. Polowa ciosow go nie rusza. Bijcie mocno albo wcale.' },
      ],
      enemies: [
        { line: 1, effectId: 'wodnik_return_on_round_end', position: 'attack' },
        { line: 1, effectId: 'utopiec_half_damage', position: 'defense' },
        { line: 1, effectId: 'bagiennik_cleanse_buff', position: 'attack' },
      ],
      winCondition: 'kill_all',
      rewards: [
        { type: 'draw', value: 1, description: 'Brzegina przeprowadza druzyne. Gracz dobiera 1 karte.' },
      ],
      narrativeOutro: [
        { text: 'Wodnik odplywa z sykiem. Utopiec opada w mul. Bagiennik sie rozpada.', style: 'italic' },
        { text: 'Z wody, po cichu, wynurza sie kobieta. Zielone wlosy, lagodne oczy.', style: 'italic' },
        { speaker: 'Brzegina', text: 'Znam cie, szeptunko. Twoja matka zostawiala mi wianki.' },
        { speaker: 'Zywia', text: 'I ja zostawiam. Co roku.' },
        { speaker: 'Brzegina', text: 'Dlatego was przeprowadze.' },
        { text: 'Idzie z nimi przez brod. Gdzie stapa — woda rozstepuje sie, dno suche.', style: 'italic' },
        { speaker: 'Brzegina', text: 'Twoj Wodnik ma racje — nikt tu nie przychodzi z szacunkiem. Ale ty przyszedles dla brata. Las to zauważy.' },
        { text: 'Znika bez pluskotu. Na kamieniu zostaje zielona muszla.', style: 'italic' },
        { speaker: 'Dobromir', text: 'Co to?' },
        { speaker: 'Zywia', text: 'Szczescie. Schowaj.' },
      ],
    },

    // =========================================
    // ENCOUNTER 2: PSOTY NA SKRAJU
    // =========================================
    {
      id: 'enc2_psoty',
      title: 'Psoty na skraju',
      teachMechanic: 'Pozycje ATAK/OBRONA, kontrataki',
      narrativeIntro: [
        { text: 'Las. Sciana drzew, ciemnosc, sciezka znika po trzech krokach.', style: 'italic' },
        { speaker: 'Stach', text: 'Bylem tu za dnia. Sciezka szla prosto.' },
        { speaker: 'Bogna', text: 'Za dnia.' },
        { text: 'Ida. Pochodnia Milosza oswietla trzy kroki. Za czwartym — nic. Z ciemnosci dobiega chichotanie.', style: 'italic' },
        { text: 'Nagle pochodnia gasnie. Sama.', style: 'italic' },
        { speaker: 'Stach', text: 'KTOS MI ZABRAL BUT!' },
        { speaker: 'Bogna', text: 'Licho. Chowa rzeczy. Miesza w glowach.' },
        { text: 'Z ciemnosci wylania sie maly ksztalt — Licho. Obok Belt, duch macacy podroznym. I dalej migocze falszywe swiatlo — Bledny Ognik.', style: 'italic' },
        { speaker: 'Zywia', text: 'Nie idzcie za swiatlem! Ognik zwodzi na bagna.' },
        { speaker: 'Stach', text: 'Ja nikdzie nie ide, bo NIE MAM BUTA!' },
      ],
      enemies: [
        { line: 1, effectId: 'licho_block_draw', position: 'attack' },
        { line: 1, effectId: 'belt_rearrange', position: 'defense' },
        { line: 2, effectId: 'bledny_ognik_bounce', position: 'defense' },
      ],
      winCondition: 'kill_all',
      rewards: [
        { type: 'buff_creature', stat: 'def', value: 2, description: 'Kupalowy Ogień — 1 istota +2 DEF do konca scenariusza.' },
      ],
      narrativeOutro: [
        { text: 'Licho ucieka. Belt rozplywa sie. Ognik gasnie. Stach odnajduje but w dziupli obok martwego zuka.', style: 'italic' },
        { speaker: 'Stach', text: 'Co za popaprance.' },
        { speaker: 'Zywia', text: 'Las najpierw sprawdza, czy sie wystraszysz. Potem wysyla prawdziwe zagrozenia.' },
        { text: 'Miedzy drzewami pojawia sie cieple, spokojne swiatlo. Nie takie jak Ognik — stale, zlotawe.', style: 'italic' },
        { speaker: 'Bogna', text: 'Swietle. Dobre duszki. Te prowadza do celu.' },
        { speaker: 'Dobromir', text: 'Skad wiesz, ze to nie pulapka?' },
        { speaker: 'Bogna', text: 'Ognik drga i miga. Swietle swieca spokojnie. Naucz sie patrzec.' },
      ],
    },

    // =========================================
    // ENCOUNTER 3: LESNICE I JAROSZEK
    // =========================================
    {
      id: 'enc3_lesnice',
      title: 'Lesnice i Jaroszek',
      teachMechanic: 'Linie (L1/L2/L3), zasieg atakow',
      narrativeIntro: [
        { text: 'Swietle prowadza, ale nagle gasna. Szmer — bosie stopy na mchu.', style: 'italic' },
        { speaker: 'Zywia', text: 'Stac.' },
        { text: 'Z paproci wylaniaja sie postacie. Niewielkie, zielone wlosy, oczy jak u zwierzat. Lesnice. Lesny lud.', style: 'italic' },
        { text: 'Z ciemnosci wyskakuje maly, szybki ksztalt — Jaroszek. Biegnie na Stacha.', style: 'italic' },
        { speaker: 'Stach', text: 'CO TO?!' },
        { speaker: 'Zywia', text: 'STACH! NIE GON!' },
        { text: 'Za pozno. Stach znika. Lesnice atakuja.', style: 'italic' },
      ],
      enemies: [
        { line: 1, effectId: 'lesnica_double_attack', position: 'attack' },
        { line: 1, effectId: 'lesnica_double_attack', position: 'attack' },
        { line: 3, effectId: 'jaroszek_paralyze', position: 'attack' },
      ],
      winCondition: 'kill_all',
      rewards: [
        { type: 'narrative_only', description: 'Jaroszek zostaje ze Stachem. Piszczek — nowy kompan.' },
      ],
      narrativeOutro: [
        { text: 'Lesnice cofaja sie. Z krzakow wylazi Stach — podrapany, brudny, ale caly. W rece trzyma szarpiacy sie ksztalt.', style: 'italic' },
        { speaker: 'Stach', text: 'Zlapalem go!' },
        { speaker: 'Bogna', text: 'Zlapales Jaroszka. To sie nie zdarza.' },
        { speaker: 'Stach', text: 'Bede go wolal Piszczek.' },
        { text: 'Jaroszek warczy, ale nie ucieka. Siada Stachowi na ramieniu.', style: 'italic' },
        { speaker: 'Milosz', text: 'Ten chlop jest albo odwazny, albo za glupi, zeby sie bac.' },
        { speaker: 'Radek', text: 'Jedno i drugie. Dlatego go zabralem.' },
      ],
    },

    // =========================================
    // ENCOUNTER 4: BAGNA
    // =========================================
    {
      id: 'enc4_bagna',
      title: 'Bagna',
      teachMechanic: 'Taunt, latanie vs typ ataku',
      narrativeIntro: [
        { text: 'Sciezka schodzi w dol. Pod stopami — miekko, mokro. Powietrze gestnieje, smierdzi bagnem.', style: 'italic' },
        { speaker: 'Milosz', text: 'Nie podoba mi sie to.' },
        { speaker: 'Bogna', text: 'Nie powinno. Bagna to nie las. Tu zyja inne rzeczy.' },
        { text: 'Spomiedzy korzeni wypelza owadopodobny stwor — Blotnik. Za nim — ohydna, tlusta ropucha ze skrzydlami nietoperza — Cmuch. I z boku, z mulu, kolejny Bagiennik.', style: 'italic' },
        { speaker: 'Zywia', text: 'Blotnik. Wabi na siebie — nie da wam atakowac nikogo innego, dopoki zyje.' },
        { speaker: 'Dobromir', text: 'To jak go ominac?' },
        { speaker: 'Bogna', text: 'Nie ominiesz. Trzeba go zabic pierwszego. Albo strzelić ponad nim — do tego latajacego paskudztwa.' },
      ],
      enemies: [
        { line: 1, effectId: 'blotnik_taunt', position: 'attack' },
        { line: 2, effectId: 'cmuch_no_counter_received', position: 'attack' },
        { line: 1, effectId: 'bagiennik_cleanse_buff', position: 'attack' },
      ],
      winCondition: 'kill_all',
      rewards: [
        { type: 'heal_all', value: 2, description: 'Barstuki lecza druzyne: wszystkie istoty regeneruja 2 DEF.' },
      ],
      narrativeOutro: [
        { text: 'Blotnik gasnie. Cmuch odlatuje w ciemnosc. Bagiennik sie rozpada.', style: 'italic' },
        { text: 'Druzyna stoi po kolana w mule, zdyszana. Dobromir ma rozcięte ramie.', style: 'italic' },
        { speaker: 'Zywia', text: 'Dobromir, pokaz.' },
        { speaker: 'Dobromir', text: 'To nic, zadraśnięcie...' },
        { speaker: 'Zywia', text: 'Pokaz.' },
        { text: 'Opatruje go. Z mchu wylaniaja sie dwa male ksztalty. Barstuki. Niewielkie skrzaty. Dotykaja ran — rany sie zamykaja.', style: 'italic' },
        { speaker: 'Dobromir', text: 'One... lecza?' },
        { speaker: 'Zywia', text: 'Lesne znachorki. Zyja tu od zawsze. Pomagaja tym, ktorzy na pomoc zasluguja.' },
        { speaker: 'Stach', text: 'Widzisz? Nie wszystko tu chce nas zabic. Tylko prawie wszystko.' },
      ],
    },

    // =========================================
    // ENCOUNTER 5: TANIEC RUSALEK
    // =========================================
    {
      id: 'enc5_rusalki',
      title: 'Taniec Rusalek',
      teachMechanic: 'Premie istot, efekty specjalne',
      narrativeIntro: [
        { text: 'Polana. Srebrny ksiezyc. Piec postaci tanczy w kregu — tak piekne, ze serce boli.', style: 'italic' },
        { text: 'Stach robi krok do przodu. Milosz lapie go za ramie.', style: 'italic' },
        { speaker: 'Bogna', text: 'Rusalki. Nie patrz za dlugo.' },
        { text: 'Jedna z nich zatrzymuje sie. Patrzy na Radka. Uśmiecha sie.', style: 'italic' },
        { speaker: 'Rusalka', text: 'Zatancz ze mna. Tylko jeden taniec.' },
        { speaker: 'Zywia', text: 'Radek!' },
        { text: 'Z tylu kregu wylaniaja sie Wily. I z cienia drzew nadchodzi Tesknica — chuda, blada postac, od ktorej bije przejmujacy smutek.', style: 'italic' },
        { text: 'Dobromir nagle sie zatrzymuje.', style: 'italic' },
        { speaker: 'Dobromir', text: 'Nie dam rady. Po co ja tu poszedem. Jas i tak umrze. Wszyscy umrzemy.' },
        { speaker: 'Zywia', text: 'To Tesknica. Sprowadza smutek. To nie twoje mysli, chlopcze — to jej.' },
        { speaker: 'Dobromir', text: 'Skad wiesz?' },
        { speaker: 'Zywia', text: 'Bo gdyby to byly twoje mysli — nie mialbys lez w oczach. Swoj smutek czlowiek trzyma na sucho.' },
      ],
      enemies: [
        { line: 1, effectId: 'wila_convert_weak_enemies', position: 'attack' },
        { line: 1, effectId: 'wila_convert_weak_enemies', position: 'defense' },
        { line: 3, effectId: 'rusalka_mirror_attack', position: 'attack' },
        { line: 2, effectId: 'tesknica_block_enhance', position: 'defense' },
      ],
      winCondition: 'kill_all',
      rewards: [
        { type: 'add_adventure', adventureEffectId: 'adventure_pioro_zarptaka', description: 'Pioro Zar-Ptaka — przywraca DEF istoty do bazy.' },
      ],
      narrativeOutro: [
        { text: 'Rusalki znikaja jak mgla. Tesknica rozplywa sie i smutek ustepuje.', style: 'italic' },
        { speaker: 'Dobromir', text: 'Przepraszam. Nie wiem, co we mnie wstapilo.' },
        { speaker: 'Milosz', text: 'Wstapila Tesknica. Nie przepraszaj.' },
        { speaker: 'Zywia', text: 'Zapamietaj to uczucie. Nastepnym razem, jak je poczujesz — bedziesz wiedzial, ze to nie ty. To pierwszy krok do bycia prawdziwym znachorem.' },
        { text: 'Na ziemi lezy pioro. Zlote, cieple. Zarzy sie delikatnie.', style: 'italic' },
        { speaker: 'Bogna', text: 'Zar-ptak. Zostawil dar.' },
      ],
    },

    // =========================================
    // ENCOUNTER 6: POLOWANIE
    // =========================================
    {
      id: 'enc6_polowanie',
      title: 'Polowanie',
      teachMechanic: 'Karty przygody, survival',
      narrativeIntro: [
        { text: 'Rogi. Daleko, ale sie zblizaja. I szczekanie — nie psow. Te glosy sa starsze.', style: 'italic' },
        { speaker: 'Bogna', text: 'Dziki Mysliwy. Poluje od tysiacleci. Nikt nie zna jego twarzy. Nikt nie zna jego imienia.' },
        { speaker: 'Radek', text: 'Da sie go pokonac?' },
        { speaker: 'Bogna', text: 'Nie. Trzeba przetrwac do switu.' },
        { text: 'Radek patrzy na niebo. Pas ciemnosci nad wschodem jest wezszy.', style: 'italic' },
        { speaker: 'Milosz', text: 'Ile?' },
        { speaker: 'Zywia', text: 'Dostatecznie dlugo.' },
        { speaker: 'Stach', text: 'No pieknie. Nawet Piszczek sie boi.' },
        { text: 'Zagraj karty przygody, zeby przetrwac! Przyjazn sprawi, ze jedna istota ochroni druga.', style: 'bold' },
      ],
      enemies: [
        { line: 1, effectId: 'dziki_mysliwy_return_on_kill', position: 'attack' },
        { line: 1, effectId: 'pies_upior_scenario', position: 'attack', customStats: { atk: 2, def: 1 } },
        { line: 1, effectId: 'pies_upior_scenario', position: 'attack', customStats: { atk: 2, def: 1 } },
      ],
      winCondition: 'survive',
      survivalRounds: 4,
      triggerRules: [
        {
          id: 'enc6_respawn_mysliwy',
          condition: { event: 'on_round_start' },
          actions: [{
            type: 'respawn_from_graveyard',
            targetEffectId: 'dziki_mysliwy_return_on_kill',
            line: 1,
            position: 'attack',
          }],
        },
        {
          id: 'enc6_spawn_pies',
          condition: { event: 'on_round_start' },
          actions: [{
            type: 'spawn_creature',
            spawnData: { effectId: 'pies_upior_scenario', name: 'Pies-upior', atk: 2, def: 1 },
            line: 1,
            position: 'attack',
            maxOnField: 3,
          }],
        },
      ],
      rewards: [
        { type: 'recover_graveyard', value: 1, description: 'Gracz odzyskuje 1 istote z cmentarza.' },
      ],
      narrativeOutro: [
        { text: 'Rogi milkna. Na wschodzie — szarosc.', style: 'italic' },
        { text: 'Mysliwy stoi na skraju polany. Nie ma twarzy — cien, rogi, i cos co mogloby byc oczami. Patrzy na nich.', style: 'italic' },
        { text: 'Potem odwraca sie i znika.', style: 'italic' },
        { speaker: 'Milosz', text: 'Przezylismy.' },
        { speaker: 'Zywia', text: 'Jeszcze nie. Patrz.' },
        { text: 'Miedzy drzewami — swiatlo. Srebrne, miekkie, spokojne. I zapach, ktorego nikt nie zna. Zapach kwitnacej paproci.', style: 'italic' },
      ],
    },

    // =========================================
    // ENCOUNTER 7: POLANA PAPROCI — BOSS
    // =========================================
    {
      id: 'enc7_boss',
      title: 'Polana Paproci',
      teachMechanic: 'Wszystko razem — finałowy test',
      narrativeIntro: [
        { text: 'Polana jest okragla i cicha. Cisza taka, ze slychac bicie serca.', style: 'italic' },
        { text: 'Posrodku — paproc. Zwyczajna. Ale miedzy liscmi — zloty blask. Kwiat.', style: 'italic' },
        { speaker: 'Radek', text: 'Tam jest.' },
        { text: 'Ziemia drzy.', style: 'italic' },
        { text: 'Po drugiej stronie polany — cos ogromne. Wyglada jak drzewo, stary dab, ktory postanowil wstac. Ma oczy. Zielone, spokojne, glebokie.', style: 'italic' },
        { speaker: 'Bogna', text: 'Leszy. Pan lasu.' },
        { text: 'Obok Leszego — omszialy pien. Bugaj. Duch lasu, niewidoczny straznik. Z traw podnosi sie waz z korona na lbie. Krol Wezow.', style: 'italic' },
        { speaker: 'Zywia', text: 'Straznicy polany. Nie przepuszcza nikogo, kto nie zasluguje.' },
        { speaker: 'Leszy', text: 'Przyszliscie po kwiat.' },
        { speaker: 'Radek', text: 'Tak.' },
        { speaker: 'Leszy', text: 'Wielu przyszlo. Dla siebie. Dla slawy. Dla zlota. Zaden nie wrocil.' },
        { speaker: 'Radek', text: 'Przyszedlem dla brata.' },
        { text: 'Leszy milczy. Dlugo. Drzewa na polanie pochylaja sie, jakby nasluchiwaly.', style: 'italic' },
        { speaker: 'Leszy', text: 'To sprawdze.' },
        { text: 'Leszy jest odporny na obrazenia dopoki zyje Bugaj LUB Krol Wezow. Zabij straznikow najpierw!', style: 'bold' },
      ],
      enemies: [
        { line: 1, effectId: 'bugaj_def_to_atk', position: 'defense', customStats: { atk: 0, def: 10 } },
        { line: 1, effectId: 'krol_wezow_always_counter', position: 'defense', customStats: { atk: 3, def: 6 } },
        { line: 2, effectId: 'leszy_post_attack_defend', position: 'attack', customStats: { atk: 5, def: 8 } },
      ],
      winCondition: 'kill_target',
      winTarget: 'leszy_post_attack_defend',
      triggerRules: [
        {
          id: 'enc7_leszy_immunity',
          condition: { event: 'on_state_change' },
          actions: [{
            type: 'set_immune',
            targetEffectId: 'leszy_post_attack_defend',
            guardEffectIds: ['bugaj_def_to_atk', 'krol_wezow_always_counter'],
          }],
        },
      ],
      rewards: [],
      narrativeOutro: [
        { text: 'Leszy pada na kolano. Drzewa na polanie pochylaja sie.', style: 'italic' },
        { text: 'Przez chwile — cisza. Potem Leszy podnosi glowe.', style: 'italic' },
        { speaker: 'Leszy', text: 'Bierz kwiat.' },
        { speaker: 'Radek', text: 'Dlaczego mnie przepuszczasz?' },
        { speaker: 'Leszy', text: 'Przyszedles nie dla siebie. Gdybys przyszedl dla siebie — nie znalazlbys nawet sciezki.' },
        { text: 'Radek podchodzi do paproci. Kleka. Kwiat jest maly — zloty, delikatny. Ciepły w dloni. Pachnie jak lato i deszcz jednoczesnie.', style: 'italic' },
        { speaker: 'Leszy', text: 'Przypilnuj go, szeptunko. Las dal. Las kiedys wezmie.' },
        { speaker: 'Zywia', text: 'Wiem.' },
        { text: 'Bugaj zamiera — znow wyglada jak pien. Krol Wezow znika w trawie. Leszy prostuje sie i cofa miedzy drzewa.', style: 'italic' },
        { speaker: 'Stach', text: 'Poszedl?' },
        { speaker: 'Bogna', text: 'Nie poszedl. Jest wszedzie. Las to Leszy. Leszy to las.' },
        { speaker: 'Radek', text: 'Chodzmy do domu.' },
      ],
    },
  ],

  // ===== EPILOG =====
  epilogNarrative: [
    { text: 'Wracali, kiedy niebo rozowialo. Las byl juz zwyklym lasem — drzewa spokojne, ptaki spiewaly. Mgla lezala nad Mokra.', style: 'italic' },
    { text: 'Brod przeszli bez przeszkod. Wodnika nie bylo. Na kamieniu — mokry slad i nic wiecej.', style: 'italic' },
    { text: 'Na powierzchni rzeki, nieruchomo, lezal samotny wianek z nagietkow. Ten sam, ktory wczoraj puscila matka Radka. Nie odplynal. Czekal.', style: 'italic' },
    { text: 'We wiosce dogasaly ogniska. Kury chodzily po podworku. Sieciech stal przed chata. Kiedy zobaczyl syna — oparl sie o framuge i zamknal oczy.', style: 'italic' },
    { text: 'Zywia wziela kwiat i zamknela sie z Jasiem w izbie. Szepty trwaly dlugo. Kiedy wyszla — Jas spal spokojnie. Po raz pierwszy od wiosny oddychal bez chrapania.', style: 'italic' },
    { speaker: 'Zywia', text: 'Wyzdrowieje.' },
    { text: 'Radek usiadl na progu. Milosz obok. Piszczek — Jaroszek Stacha — spal mu na ramieniu, zwiniety w klebek. Dobromir opatrywal sobie ostatnie zadrapania — sam, bez pomocy, z pewnoscia w rekach, ktorej wczoraj jeszcze nie mial.', style: 'italic' },
    { speaker: 'Radek', text: 'Leszy powiedzial, ze las dal mi kwiat, bo nie szedlem dla siebie.' },
    { speaker: 'Milosz', text: 'I co z tego?' },
    { speaker: 'Radek', text: 'Nic. Ale nastepnym razem, jak bede szedl do lasu — zostawie mu cos na skraju. Chleb. Albo miod.' },
    { speaker: 'Milosz', text: '' },
    { text: 'Bogna stala na uboczu, patrzac na las za rzeka. Nie mowila nic. Ale katem oka Radek widzial, ze sie usmiecha.', style: 'italic' },
    { text: 'Slonce wstawalo nad Mokrzanami. Jas spal. I snil mu sie las — nie straszny, nie grozny. Las, ktory pachnie latem i deszczem jednoczesnie.', style: 'italic' },
    { text: 'KONIEC', style: 'bold' },
  ],
}
