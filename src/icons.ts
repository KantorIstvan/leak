import {
  Airplane, AirplaneTakeoff, Anchor, AppStoreLogo, Archive, Armchair, Avocado, Baby, BabyCarriage, Backpack, Balloon, Bandaids, Bank,
  Barbell, Basket, Basketball, Bathtub, BatteryCharging, Bed, BeerBottle, BeerStein, Bell, Bicycle, Bird, Boat, Bone, Book, BookOpen, Books,
  BowlFood, BowlSteam, BowlingBall, Brain, Brandy, Bread, Briefcase, Broom, Building, Buildings, Bus, Cake, Calculator, Calendar, Camera,
  Car, CarProfile, Carrot, Cat, Certificate, Chalkboard, Champagne, ChargingStation, ChartLineUp, Cheese, Church, Cigarette, CigaretteSlash,
  Clock, Cloud, Club, Code, Coffee, CoffeeBean, CoinVertical, Coins, Compass, Confetti, Cookie, CookingPot, Couch, Cpu, CreditCard, Cross,
  Crown, CurrencyDollar, CurrencyEur, CurrencyGbp, Desktop, DeviceMobile, DeviceTablet, DiceFive, Diamond, Dog, Door, DotsThree, Dress, Drop,
  Egg, Envelope, Eye, Eyeglasses, Fan, FilmReel, FilmSlate, FilmStrip, Fire, FirstAid, FirstAidKit, Fish, FishSimple, Flag, Flame, Flower,
  Football, ForkKnife, GameController, Gavel, GasPump, Gift, Globe, Golf, GraduationCap, Grains, Guitar, Hamburger, Hammer, HandCoins,
  HandHeart, Handbag, Handshake, HardDrive, Headphones, Heart, Heartbeat, Hoodie, Horse, Hospital, House, HouseLine, IceCream, Invoice,
  Island, Jeep, Joystick, Key, Keyboard, Knife, Lamp, Laptop, Leaf, Lightbulb, Lightning, Lock, MapPin, MapTrifold, Martini, MaskHappy,
  Medal, Microphone, Money, Monitor, Moon, Motorcycle, Mountains, Mouse, MusicNote, MusicNotes, Newspaper, Notebook, Orange, Oven, Package,
  PaintBrush, Palette, Pants, PawPrint, Pencil, Pepper, Percent, PersonSimpleBike, PersonSimpleRun, PersonSimpleSwim, PersonSimpleWalk,
  Phone, PianoKeys, PiggyBank, Pill, PintGlass, Pizza, Plant, Plug, Popcorn, PottedPlant, Printer, PuzzlePiece, Rabbit, Racquet, Receipt,
  Recycle, Robot, Rocket, Sailboat, Scales, Scissors, Scooter, Shield, ShieldCheck, ShoppingBag, ShoppingCart, Shower, Shrimp, SimCard,
  Smiley, Sneaker, Snowflake, SoccerBall, Spade, Sparkle, SpotifyLogo, Star, SteamLogo, Stethoscope, Storefront, Student, Subway, Suitcase,
  SuitcaseRolling, Sun, Sunglasses, Syringe, Taxi, Tag, Target, Television, TennisBall, Tent, Thermometer, Ticket, Toilet, Toolbox, Tooth,
  Tote, Train, Tram, Tree, TrendUp, Trophy, Truck, TShirt, TwitchLogo, Umbrella, User, Users, UsersThree, Van, Vault, VideoCamera,
  Volleyball, Wallet, WashingMachine, Watch, WifiHigh, Wine, Wrench, YoutubeLogo, type Icon,
} from '@phosphor-icons/react'

// Curated, grouped icon set for categories. Stored in the DB by name, so names here must never be renamed.
export const ICON_GROUPS: Record<string, Record<string, Icon>> = {
  food: {
    ForkKnife, Hamburger, Pizza, Coffee, CoffeeBean, Cookie, Cake, IceCream, Popcorn, BowlFood, BowlSteam, Carrot, Orange, Avocado, Bread,
    Cheese, Egg, FishSimple, Shrimp, Pepper, Grains, CookingPot, Knife, Basket, ShoppingCart, ShoppingBag, Storefront, Tote, Receipt,
  },
  drinks: { Martini, Wine, BeerBottle, BeerStein, Champagne, Brandy, PintGlass, Cigarette, CigaretteSlash },
  transport: {
    Car, CarProfile, Jeep, Taxi, Bus, Train, Subway, Tram, Bicycle, Motorcycle, Scooter, GasPump, ChargingStation, Truck, Van, Boat,
    Sailboat, Airplane, AirplaneTakeoff,
  },
  travel: { Suitcase, SuitcaseRolling, Backpack, Tent, Mountains, Island, Globe, MapPin, MapTrifold, Compass, Ticket, Anchor, Umbrella },
  home: {
    House, HouseLine, Building, Buildings, Bed, Couch, Armchair, Bathtub, Shower, Toilet, Lamp, Lightbulb, Lightning, Drop, Flame, Fire,
    Thermometer, Snowflake, Fan, Oven, WashingMachine, Wrench, Hammer, Toolbox, Broom, Key, Door, Plant, PottedPlant, Flower, Tree,
  },
  health: {
    Heartbeat, FirstAid, FirstAidKit, Pill, Syringe, Bandaids, Stethoscope, Hospital, Tooth, Eye, Eyeglasses, Brain, Barbell,
    PersonSimpleRun, PersonSimpleWalk, PersonSimpleBike, PersonSimpleSwim, Sneaker,
  },
  sport: { Basketball, SoccerBall, Football, Volleyball, TennisBall, Golf, BowlingBall, Racquet, Trophy, Medal },
  style: { TShirt, Dress, Pants, Hoodie, Watch, Handbag, Diamond, Crown, Sunglasses, Scissors },
  fun: {
    GameController, Joystick, DiceFive, Spade, Club, PuzzlePiece, Television, FilmSlate, FilmStrip, FilmReel, MusicNote, MusicNotes,
    Headphones, Microphone, Guitar, PianoKeys, Palette, PaintBrush, Camera, VideoCamera, MaskHappy, Confetti, Balloon, Gift, Sparkle,
  },
  tech: {
    Laptop, Desktop, DeviceMobile, DeviceTablet, Monitor, Keyboard, Mouse, Printer, HardDrive, Cpu, Robot, Code, Cloud, WifiHigh, Phone,
    SimCard, Plug, BatteryCharging, AppStoreLogo, SpotifyLogo, YoutubeLogo, TwitchLogo, SteamLogo,
  },
  money: {
    Money, Coins, CoinVertical, CurrencyDollar, CurrencyEur, CurrencyGbp, Wallet, Bank, CreditCard, PiggyBank, Vault, ChartLineUp,
    TrendUp, HandCoins, Handshake, Briefcase, Invoice, Calculator, Percent, Scales, Gavel,
  },
  learning: { GraduationCap, Student, Chalkboard, Book, BookOpen, Books, Notebook, Pencil, Newspaper, Certificate },
  people: { User, Users, UsersThree, Baby, BabyCarriage, Heart, HandHeart, Smiley, Church, Cross },
  pets: { Dog, Cat, PawPrint, Bone, Bird, Fish, Horse, Rabbit, Leaf, Recycle },
  other: {
    Star, Target, Flag, Rocket, Sun, Moon, Shield, ShieldCheck, Lock, Bell, Calendar, Clock, Envelope, Tag, Archive, Package, DotsThree,
  },
}

export const ICONS: Record<string, Icon> = Object.assign({}, ...Object.values(ICON_GROUPS))
